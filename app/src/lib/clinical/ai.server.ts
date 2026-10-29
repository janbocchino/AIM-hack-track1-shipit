import { createOpenAI } from "@ai-sdk/openai";
import { streamText, Output, NoObjectGeneratedError } from "ai";
import type { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
export const MODEL = "openai/gpt-6-astra";

export class GatewayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Shared run id for every agent call of one pipeline turn. */
export function createAgentRunner(apiKey: string) {
  let runId: string | undefined;
  const fetchWithRun = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (runId) headers.set("X-Lovable-AIG-Run-ID", runId);
    const res = await fetch(input, { ...init, headers });
    runId ??= res.headers.get("X-Lovable-AIG-Run-ID")?.trim() || undefined;
    if (!res.ok && res.status !== 200) {
      const text = await res.clone().text().catch(() => "");
      let msg = text;
      try { msg = JSON.parse(text)?.error?.message ?? JSON.parse(text)?.message ?? text; } catch { /* keep */ }
      throw new GatewayError(res.status, msg || `AI request failed (${res.status})`);
    }
    return res;
  };
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: fetchWithRun,
  });

  async function object<T>(opts: { instructions: string; prompt: string; schema: z.ZodType<T>; signal?: AbortSignal }): Promise<T> {
    const result = streamText({
      model: provider.responses(MODEL),
      instructions: opts.instructions,
      prompt: opts.prompt,
      output: Output.object({ schema: opts.schema }),
      ...(opts.signal ? { abortSignal: opts.signal } : {}),
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    try {
      return (await result.output) as T;
    } catch (e) {
      if (NoObjectGeneratedError.isInstance(e) && e.text) {
        return opts.schema.parse(JSON.parse(e.text));
      }
      throw e;
    }
  }
  return { object, getRunId: () => runId };
}
export type AgentRunner = ReturnType<typeof createAgentRunner>;
