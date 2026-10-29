import { recordWav } from "./record-wav";

/** Start recording; returns stop() which uploads and streams the transcript. */
export async function startDictation() {
  const rec = await recordWav();
  return {
    async stop(onDelta?: (textSoFar: string) => void): Promise<string> {
      const file = await rec.stop();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => "");
        let msg = body;
        try { const j = JSON.parse(body); msg = j.error?.message ?? j.error ?? j.message ?? body; } catch { /* plain */ }
        throw new Error(res.status === 402 ? "AI credits are used up." : msg || `Transcription failed (${res.status})`);
      }
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const j = await res.json();
        return String(j.text ?? "");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let text = "";
      let final: string | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const ev = JSON.parse(data);
            if (ev.type === "transcript.text.delta") { text += ev.delta ?? ""; onDelta?.(text); }
            else if (ev.type === "transcript.text.done") final = ev.text ?? text;
            else if (ev.type === "error" || ev.error) throw new Error(ev.error?.message ?? "Transcription failed");
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
      return (final ?? text).trim();
    },
  };
}
