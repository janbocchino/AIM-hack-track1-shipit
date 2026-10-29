import { createFileRoute } from "@tanstack/react-router";

const MAX = 20 * 1024 * 1024;

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return Response.json({ error: "AI is not configured" }, { status: 500 });
        const len = Number(request.headers.get("content-length") ?? 0);
        if (len > MAX) return Response.json({ error: "Recording too long" }, { status: 413 });
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File) || !file.size) return Response.json({ error: "No audio" }, { status: 400 });
        const { transcribe } = await import("@/lib/voice/transcribe.server");
        try {
          const upstream = await transcribe(
            { baseURL: "https://ai.gateway.lovable.dev", apiKey, model: "openai/gpt-transcribe", maxFileBytes: MAX, audioOnly: false },
            file,
            { signal: request.signal },
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
