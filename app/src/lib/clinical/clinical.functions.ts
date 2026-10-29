import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Lesson, TaskContext, TurnResult } from "./types";

const LessonSchema = z.object({
  id: z.string(), createdAt: z.number(), situation: z.string(), profileId: z.string(), factKey: z.string(),
  label: z.string(), value: z.string(), verdict: z.enum(["confirmed", "rejected", "missing"]), note: z.string().optional(),
});

export const runClinicalTurn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      text: z.string().min(1).max(2000),
      prior: z.any().nullable(),
      history: z.array(z.string()).max(20),
      lessons: z.array(LessonSchema).max(200),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<TurnResult> => {
    const t0 = Date.now();
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { kind: "error", message: "AI is not configured.", ms: 0 };
    const { createAgentRunner, GatewayError } = await import("./ai.server");
    const { runTurn } = await import("./pipeline.server");
    try {
      return await runTurn(createAgentRunner(key), {
        text: data.text,
        prior: data.prior as TaskContext | null,
        history: data.history,
        lessons: data.lessons as Lesson[],
      });
    } catch (e) {
      const status = e instanceof GatewayError ? e.status : (e as { statusCode?: number })?.statusCode;
      const message =
        status === 402 ? "AI credits are used up. Add credits in Settings → Plans & credits."
        : status === 429 ? "Too many requests right now. Please wait a moment and try again."
        : status === 403 ? `AI access blocked: ${(e as Error).message}`
        : `Could not build the screen: ${(e as Error).message}`;
      console.error("runClinicalTurn", e);
      return { kind: "error", message, ms: Date.now() - t0 };
    }
  });

export const getSourceDocument = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { documentById } = await import("./pipeline.server");
    return documentById(data.id);
  });

const translations = new Map<string, string>();
export const translateSegment = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ text: z.string().max(1000) }).parse(d))
  .handler(async ({ data }) => {
    if (translations.has(data.text)) return translations.get(data.text)!;
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return "";
    const { createAgentRunner } = await import("./ai.server");
    try {
      const out = await createAgentRunner(key).object({
        schema: z.object({ english: z.string() }),
        instructions: "Translate this German clinical sentence to concise clinical English. Translate only; add nothing.",
        prompt: data.text,
      });
      translations.set(data.text, out.english);
      return out.english;
    } catch {
      return "";
    }
  });

/** Pre-computes the cached cross-document contradiction check so the first screen is fast. */
export const warmupContradictions = createServerFn({ method: "POST" }).handler(async () => {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return { ok: false };
  const { createAgentRunner } = await import("./ai.server");
  const { getContradictions } = await import("./pipeline.server");
  try {
    const c = await getContradictions(createAgentRunner(key));
    const { getTimeline } = await import("./pipeline.server");
    getTimeline(createAgentRunner(key)).catch(() => {});
    return { ok: true, count: c.length };
  } catch {
    return { ok: false };
  }
});

export const getAllDocuments = createServerFn({ method: "GET" }).handler(async () => {
  const { DOCUMENTS } = await import("./data");
  return DOCUMENTS;
});
