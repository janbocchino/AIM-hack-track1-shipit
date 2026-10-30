import { createFileRoute } from "@tanstack/react-router";

const MAX = 20 * 1024 * 1024;

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { resolveAiBackend, resolveSpeechBackend } = await import("@/lib/clinical/ai.server");
        const backend = resolveAiBackend();
        if (!backend) return Response.json({ error: "AI is not configured. Set OPENROUTER_API_KEY, OPENAI_API_KEY, or LOVABLE_API_KEY." }, { status: 500 });
        const speech = resolveSpeechBackend(backend);
        const len = Number(request.headers.get("content-length") ?? 0);
        if (len > MAX) return Response.json({ error: "Recording too long" }, { status: 413 });
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File) || !file.size) return Response.json({ error: "No audio" }, { status: 400 });
        const { transcribe } = await import("@/lib/voice/transcribe.server");
        try {
          const upstream = await transcribe(
            { baseURL: speech.audioBaseURL, apiKey: speech.apiKey, model: speech.model, maxFileBytes: MAX, audioOnly: false },
            file,
            { signal: request.signal, buffered: speech.buffered },
          );
          return new Response(upstream.body, {
            status: upstream.status,
            headers: { "content-type": upstream.headers.get("content-type") ?? "text/event-stream" },
          });
        } catch (e) {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          return Response.json({ error: (e as Error).message }, { status: 400 });
        }
      },
    },
  },
});
