import json
import io
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from clinical import load_documents, model_context, model_schema, resolve_evidence, validate_briefing
from server import AppServer, call_model


DOCUMENTS = [{"id": "test", "title": "Invented fixture", "index_date": "2016-04-15", "passages": [
    {"id": "L1", "text": "Measurement A: 12."},
    {"id": "L2", "text": "Measurement A: 18."},
]}]


def source(line="L1", quote="Measurement A: 12."):
    return {"document_id": "test", "passage_id": line, "quote": quote}


def briefing():
    return {"facts": [{"label": "Measurement", "value": "12", "date": "Date not documented",
                       "status": "documented", "sources": [source()]}],
            "missing": ["Follow-up"], "contradictions": []}


def model_briefing():
    result = briefing()
    result["facts"][0]["sources"] = [{"evidence_id": "test:L1"}]
    return result


class EvidenceTests(unittest.TestCase):
    def test_model_references_resolve_to_exact_original_text(self):
        result = resolve_evidence(model_briefing(), DOCUMENTS)
        self.assertEqual(result, briefing())
        validate_briefing(result, DOCUMENTS)

    def test_unknown_reference_ranges_and_model_quotes_rejected(self):
        for refs in [[{"evidence_id": "test:L99"}], [{"evidence_id": "test:L1-L2"}],
                     [{"evidence_id": "test:L1, test:L2"}],
                     [{"evidence_id": "test:L1", "quote": "Invented"}]]:
            result = model_briefing()
            result["facts"][0]["sources"] = refs
            with self.subTest(refs=refs), self.assertRaises(ValueError):
                resolve_evidence(result, DOCUMENTS)

    def test_multi_passage_evidence_is_resolved_separately(self):
        result = model_briefing()
        result["facts"][0]["sources"].append({"evidence_id": "test:L2"})
        resolved = resolve_evidence(result, DOCUMENTS)
        self.assertEqual([s["quote"] for s in resolved["facts"][0]["sources"]],
                         ["Measurement A: 12.", "Measurement A: 18."])

    def test_model_context_ids_match_allowed_schema(self):
        context = model_context({"documents": DOCUMENTS})
        ids = [p["evidence_id"] for d in context["documents"] for p in d["passages"]]
        schema = model_schema(DOCUMENTS)
        allowed = schema["properties"]["facts"]["items"]["properties"]["sources"]["items"]["properties"]["evidence_id"]["enum"]
        self.assertEqual(ids, allowed)
        self.assertNotIn("evidence_id", DOCUMENTS[0]["passages"][0])

    def test_valid_evidence(self):
        self.assertEqual(validate_briefing(briefing(), DOCUMENTS), briefing())

    def test_rejects_invented_quote_or_reference(self):
        for field, value in [("quote", "Measurement A: 99."), ("quote", " "),
                             ("passage_id", "L99"), ("document_id", "unknown")]:
            with self.subTest(field=field):
                result = briefing()
                result["facts"][0]["sources"][0][field] = value
                with self.assertRaises(ValueError):
                    validate_briefing(result, DOCUMENTS)

    def test_rejects_facts_without_evidence(self):
        result = briefing()
        result["facts"][0]["sources"] = []
        with self.assertRaises(ValueError):
            validate_briefing(result, DOCUMENTS)

    def test_conflict_requires_distinct_evidence(self):
        result = briefing()
        result["contradictions"] = [{"label": "Different measurements", "explanation": "Same event, different figures.",
                                     "claims": [{"text": "12", "sources": [source()]},
                                                {"text": "18", "sources": [source("L2", "Measurement A: 18.")]}]}]
        validate_briefing(result, DOCUMENTS)
        result["contradictions"][0]["claims"][1]["sources"] = [source()]
        with self.assertRaises(ValueError):
            validate_briefing(result, DOCUMENTS)

    def test_document_normalization_and_stable_ids(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp) / "documents"
            folder.mkdir()
            (folder / "test.json").write_text(json.dumps({"metadata": {"id": "test", "title": "Fixture", "date": "2016-01-01"},
                                                          "text": "Alpha<BR><BR>EF &gt; 50%<br/>Drug 1 0 0 0"}))
            passages = load_documents(temp)[0]["passages"]
            self.assertEqual(passages, [{"id": "L1", "text": "Alpha"}, {"id": "L2", "text": "EF > 50%"},
                                        {"id": "L3", "text": "Drug 1 0 0 0"}])


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = AppServer(0, DOCUMENTS, "test-model", "test-key")
        cls.thread = threading.Thread(target=cls.app.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.app.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.app.shutdown()
        cls.app.server_close()
        cls.thread.join()

    def setUp(self):
        self.app.cache.clear()
        self.app.api_key = "test-key"
        reviewer = patch("server.review_briefing", side_effect=lambda draft, *args: (draft if draft["facts"] else briefing(), {
            "status": "checked", "seconds": 0, "changes": 0, "issues_found": 0, "unresolved": []}))
        self.reviewer = reviewer.start()
        self.addCleanup(reviewer.stop)

    def post(self, body=None, origin=None):
        headers = {"Content-Type": "application/json"}
        if origin:
            headers["Origin"] = origin
        request = Request(self.url + "/api/briefing", method="POST", headers=headers,
                          data=json.dumps(body if body is not None else {"role": "GP", "task": "Review", "as_of": "2016-04-15"}).encode())
        try:
            with urlopen(request) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def test_context_never_exposes_key(self):
        with urlopen(self.url + "/api/context") as response:
            data = json.load(response)
        self.assertTrue(data["configured"])
        self.assertNotIn("test-key", json.dumps(data))

    def test_missing_key(self):
        self.app.api_key = ""
        self.assertEqual(self.post()[0], 503)

    def test_invalid_input_and_cross_origin(self):
        self.assertEqual(self.post({"role": "GP"})[0], 400)
        self.assertEqual(self.post(origin="https://example.org")[0], 403)

    def test_valid_briefing_cached_after_validation(self):
        with patch("server.call_model", return_value=briefing()) as model:
            status, result = self.post()
            self.assertEqual(status, 200)
            self.assertFalse(result["cached"])
            self.assertTrue(self.post()[1]["cached"])
            self.assertEqual(model.call_count, 0)
            self.assertEqual(self.reviewer.call_count, 1)

    def test_unavailable_quality_check_is_visible_and_not_cached(self):
        metadata = {"status": "unavailable", "seconds": 8, "changes": 0, "issues_found": 0, "unresolved": []}
        with patch("server.prepare_draft", return_value=(briefing(), 1)), patch("server.review_briefing", return_value=(briefing(), metadata)):
            status, response = self.post()
            self.assertEqual(status, 200)
            self.assertEqual(response["quality"]["status"], "unavailable")
            self.assertFalse(self.app.cache)

    def test_bad_evidence_is_not_returned_or_cached(self):
        result = briefing()
        result["facts"][0]["sources"][0]["quote"] = "Invented"
        with patch("server.review_briefing", return_value=(result, {"status": "checked"})):
            self.assertEqual(self.post()[0], 502)
            self.assertFalse(self.app.cache)

    def test_provider_failure_and_concurrent_request(self):
        with patch("server.review_briefing", side_effect=RuntimeError("Provider unavailable")):
            self.assertEqual(self.post()[0], 502)
        self.app.generation_lock.acquire()
        try:
            self.assertEqual(self.post()[0], 409)
        finally:
            self.app.generation_lock.release()

    def test_static_allowlist(self):
        with self.assertRaises(HTTPError) as error:
            urlopen(self.url + "/.env")
        self.assertEqual(error.exception.code, 404)


class ProviderTests(unittest.TestCase):
    def test_responses_payload_and_parsing(self):
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                pass

            def read(self):
                return json.dumps({"status": "completed", "output": [{"type": "message", "content": [
                    {"type": "output_text", "text": json.dumps(model_briefing())}]}]}).encode()

        with patch("server.urlopen", return_value=Response()) as upstream:
            self.assertEqual(call_model("secret", "model", {"documents": DOCUMENTS}), briefing())
            request = upstream.call_args.args[0]
            payload = json.loads(request.data)
            self.assertFalse(payload["store"])
            self.assertEqual(payload["text"]["format"]["type"], "json_schema")

    def test_provider_auth_error_does_not_expose_response(self):
        with patch("server.urlopen", side_effect=HTTPError("url", 401, "secret provider error", {}, io.BytesIO(b""))):
            with self.assertRaisesRegex(RuntimeError, "rejected the API key"):
                call_model("secret", "model", {"documents": DOCUMENTS})

    def test_credit_exhaustion_is_not_reported_as_temporary_rate_limit(self):
        response = io.BytesIO(json.dumps({"error": {"code": "credit_balance_exhausted", "type": "insufficient_quota"}}).encode())
        with patch("server.urlopen", side_effect=HTTPError("url", 429, "Quota", {}, response)):
            with self.assertRaisesRegex(RuntimeError, "credit balance is exhausted"):
                call_model("secret", "model", {"documents": DOCUMENTS})


if __name__ == "__main__":
    unittest.main()
