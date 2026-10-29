#!/usr/bin/env python3
"""Local clinical briefing app. Run: python3 src/server.py"""

import argparse
import hashlib
import json
import os
import socket
import threading
import time
from collections import OrderedDict
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from clinical import INSTRUCTIONS, load_documents, model_context, model_schema, resolve_evidence, validate_briefing
from quality import review_briefing
from source_facts import coverage_complete, ensure_coverage, prepare_draft, retain_source_conflicts

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"


def load_env():
    """Read simple KEY=value entries; existing environment variables take priority."""
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip() and not line.lstrip().startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def request_json(api_key, model, context, instructions, schema, name="clinical_briefing", max_tokens=7000, timeout=60):
    payload = {
        "model": model, "store": False, "instructions": instructions,
        "input": json.dumps(context, ensure_ascii=False),
        "text": {"format": {"type": "json_schema", "name": name, "strict": True, "schema": schema}},
        "max_output_tokens": max_tokens,
    }
    request = Request("https://api.openai.com/v1/responses",
                      data=json.dumps(payload).encode(), method="POST",
                      headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=timeout) as response:
            result = json.load(response)
    except HTTPError as error:
        try:
            details = json.loads(error.read(65536)).get("error", {})
            code = details.get("code") if isinstance(details, dict) else None
        except (ValueError, OSError, TypeError, AttributeError):
            code = None
        quota_messages = {
            "credit_balance_exhausted": "Your OpenAI API credit balance is exhausted. Add credits in OpenAI API billing, then generate again.",
            "insufficient_quota": "Your OpenAI API quota is exhausted. Check your API billing balance and usage limits, then generate again.",
            "project_spend_limit_exceeded": "Your OpenAI project has reached its spend limit. Check that project's limit in OpenAI settings.",
            "organization_spend_limit_exceeded": "Your OpenAI organization has reached its spend limit. Check its limit in OpenAI settings.",
            "organization_usage_limit_exceeded": "Your OpenAI organization has reached its approved usage limit. Check OpenAI usage limits or contact support.",
        }
        if error.code == 429 and isinstance(code, str) and code in quota_messages:
            raise RuntimeError(quota_messages[code]) from None
        messages = {
            401: "OpenAI rejected the API key. Check OPENAI_API_KEY in src/.env and restart.",
            403: "This API key cannot access the selected model. Check your OpenAI project permissions.",
            404: "Model unavailable. Set OPENAI_MODEL to a model your project can access and restart.",
            429: "OpenAI rate limit reached. Wait before trying again. If it persists, check your project's rate and usage limits.",
        }
        raise RuntimeError(messages.get(error.code, f"OpenAI request failed (HTTP {error.code}). Check model access and server configuration.")) from None
    except (URLError, TimeoutError, socket.timeout):
        raise RuntimeError(f"Could not reach OpenAI within {timeout:g} seconds. Check your connection and try again.") from None
    if result.get("status") != "completed":
        raise RuntimeError("OpenAI did not complete the briefing. Try again or select another model.")
    content = [part for item in result.get("output", []) for part in item.get("content", [])]
    if any(part.get("type") == "refusal" for part in content):
        raise RuntimeError("The model declined this request. Try a more specific record-review task.")
    text = "".join(part.get("text", "") for part in content if part.get("type") == "output_text")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        raise RuntimeError("OpenAI returned an unreadable briefing. Please try again.") from None
    return parsed


def call_model(api_key, model, context):
    parsed = request_json(api_key, model, model_context(context), INSTRUCTIONS, model_schema(context["documents"]))
    return resolve_evidence(parsed, context["documents"])


class AppServer(ThreadingHTTPServer):
    def __init__(self, port, documents, model, api_key, quality_model=None, quality_timeout=5):
        super().__init__(("127.0.0.1", port), Handler)
        self.documents, self.model, self.api_key = documents, model, api_key
        self.quality_model, self.quality_timeout = quality_model or model, quality_timeout
        self.cache = OrderedDict()
        self.generation_lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Never log patient text, task inputs or credentials.
        pass

    def send(self, status, data, content_type="application/json; charset=utf-8"):
        body = json.dumps(data, ensure_ascii=False).encode() if content_type.startswith("application/json") else data
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        if self.path == "/api/context":
            return self.send(200, {"documents": self.server.documents,
                                  "configured": bool(self.server.api_key), "model": self.server.quality_model,
                                  "quality_model": self.server.quality_model, "quality_timeout_seconds": self.server.quality_timeout})
        files = {"/": ("index.html", "text/html; charset=utf-8"),
                 "/app.js": ("app.js", "text/javascript; charset=utf-8"),
                 "/style.css": ("style.css", "text/css; charset=utf-8")}
        if self.path not in files:
            return self.send(404, {"error": "Not found."})
        filename, mime = files[self.path]
        return self.send(200, (STATIC / filename).read_bytes(), mime)

    def do_POST(self):
        if self.path != "/api/briefing":
            return self.send(404, {"error": "Not found."})
        port = self.server.server_port
        allowed = {f"http://localhost:{port}", f"http://127.0.0.1:{port}"}
        if self.headers.get("Origin") and self.headers["Origin"] not in allowed:
            return self.send(403, {"error": "Requests must come from this local app."})
        if self.headers.get_content_type() != "application/json":
            return self.send(415, {"error": "Send JSON."})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size <= 0 or size > 12000:
                raise ValueError("Request must be between 1 and 12000 bytes.")
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ValueError("Send a role, task and record cutoff.")
            fields = {}
            for key, limit in (("role", 120), ("task", 3000), ("as_of", 10)):
                value = body.get(key)
                if not isinstance(value, str) or not 1 <= len(value.strip()) <= limit:
                    raise ValueError(f"Provide a valid {key} (maximum {limit} characters).")
                fields[key] = value.strip()
            date.fromisoformat(fields["as_of"])
        except (ValueError, UnicodeDecodeError):
            return self.send(400, {"error": "Enter a role, a task (up to 3000 characters) and a valid cutoff date."})
        if not self.server.api_key:
            return self.send(503, {"error": "Add OPENAI_API_KEY to src/.env and restart the server. Source browsing works without a key."})
        # A single in-flight generation prevents accidental concurrent API charges.
        if not self.server.generation_lock.acquire(blocking=False):
            return self.send(409, {"error": "Another briefing is being generated. Please wait and try again."})
        try:
            started = time.monotonic()
            key = hashlib.sha256(json.dumps(fields, sort_keys=True).encode()).hexdigest()
            cached = key in self.server.cache
            if cached:
                result, quality = self.server.cache[key]
                self.server.cache.move_to_end(key)
            else:
                context = {**fields, "documents": self.server.documents}
                draft, _ = prepare_draft(context)
                result, quality = review_briefing(draft, context,
                                  self.server.api_key, self.server.quality_model, self.server.quality_timeout, request_json,
                                  coverage_complete(context))
                if quality["status"] == "unavailable" and not draft["facts"] and not draft["missing"]:
                    raise RuntimeError("The fast review could not complete this task. Please try again or use a more focused task.")
                result, source_facts = ensure_coverage(result, context)
                result = validate_briefing(retain_source_conflicts(result, draft), self.server.documents)
                quality["source_checked_facts"] = source_facts
                # An unavailable review may be transient: let the next request try again.
                if quality["status"] != "unavailable":
                    self.server.cache[key] = (result, quality)
                    if len(self.server.cache) > 64:
                        self.server.cache.popitem(last=False)
            self.send(200, {"briefing": result, "seconds": round(time.monotonic() - started, 2),
                            "cached": cached, "as_of": fields["as_of"], "quality": quality})
        except (ValueError, RuntimeError) as error:
            self.send(502, {"error": str(error)})
        except Exception:
            self.send(500, {"error": "Could not generate the briefing. Restart the server and try again."})
        finally:
            self.server.generation_lock.release()


def main():
    load_env()
    parser = argparse.ArgumentParser(description="Local clinical briefing prototype")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    directory = Path(os.environ.get("DATA_DIR", str(ROOT.parent / "data" / "patient-0000-0001"))).expanduser()
    if not directory.is_absolute():
        directory = ROOT / directory
    try:
        documents = load_documents(directory)
    except (ValueError, OSError, KeyError) as error:
        parser.exit(1, f"Could not load documents: {error}\n")
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    model = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")
    try:
        quality_timeout = float(os.environ.get("QUALITY_TIMEOUT_SECONDS", "5"))
        if not 1 <= quality_timeout <= 15:
            raise ValueError
    except ValueError:
        parser.exit(1, "QUALITY_TIMEOUT_SECONDS must be between 1 and 15.\n")
    server = AppServer(args.port, documents, model, key, os.environ.get("QUALITY_MODEL"), quality_timeout)
    print(f"Clinical briefing: http://localhost:{server.server_port}")
    print(f"{len(documents)} documents loaded. OpenAI key: {'configured' if key else 'missing — add it to src/.env'}. Model: {model}.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
