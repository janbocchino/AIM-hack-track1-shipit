import { createOpenAI } from "@ai-sdk/openai";
import { streamText, Output, NoObjectGeneratedError } from "ai";
import type { z } from "zod";
import { serverEnv } from "../server-env";

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1";
const LOVABLE_MODEL = "openai/gpt-6-astra";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_OPENAI_MODEL = "gpt-4.1";
const DEFAULT_OPENAI_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";
const DEFAULT_OPENROUTER_MODEL = "google/gemini-3.1-flash-lite";

/** Lovable gateway chat model. Direct OpenAI and OpenRouter use `resolveAiBackend().chatModel`. */
export const MODEL = LOVABLE_MODEL;

export type AiProvider = "openai" | "lovable" | "openrouter";

export type AiBackend = {
  provider: AiProvider;
  apiKey: string;
  /** OpenAI-compatible root, including `/v1`. */
  baseURL: string;
  /** Host root without `/v1`, for `/v1/audio/transcriptions`. */
  audioBaseURL: string;
  chatModel: string;
  transcribeModel: string;
};

export type SpeechBackend = {
  audioBaseURL: string;
  apiKey: string;
  model: string;
  buffered: boolean;
};

function envValue(name: string) {
  return serverEnv(name);
}

function lovableBackend(apiKey: string): AiBackend {
  return {
    provider: "lovable",
    apiKey,
    baseURL: LOVABLE_GATEWAY,
    audioBaseURL: "https://ai.gateway.lovable.dev",
    chatModel: LOVABLE_MODEL,
    transcribeModel: "openai/gpt-transcribe",
  };
}

function openaiBackend(apiKey: string): AiBackend {
  const baseURL = (envValue("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/+$/, "");
  return {
    provider: "openai",
    apiKey,
    baseURL,
    audioBaseURL: baseURL.replace(/\/v1$/, ""),
    chatModel: envValue("OPENAI_MODEL") || DEFAULT_OPENAI_MODEL,
    transcribeModel: envValue("OPENAI_TRANSCRIBE_MODEL") || DEFAULT_OPENAI_TRANSCRIBE_MODEL,
  };
}

function openrouterBackend(apiKey: string): AiBackend {
  return {
    provider: "openrouter",
    apiKey,
    baseURL: OPENROUTER_BASE,
    audioBaseURL: "https://openrouter.ai",
    chatModel: envValue("OPENROUTER_MODEL") || DEFAULT_OPENROUTER_MODEL,
    transcribeModel: envValue("OPENAI_TRANSCRIBE_MODEL") || DEFAULT_OPENAI_TRANSCRIBE_MODEL,
  };
}

/**
 * Pick the chat backend.
 * `OPENROUTER_API_KEY` wins unless `AI_PROVIDER` is `openai` or `lovable`.
 * An explicit `AI_PROVIDER` requires that provider's key.
 */
export function resolveAiBackend(): AiBackend | null {
  const openaiKey = envValue("OPENAI_API_KEY");
  const lovableKey = envValue("LOVABLE_API_KEY");
  const openrouterKey = envValue("OPENROUTER_API_KEY");
  const choice = envValue("AI_PROVIDER").toLowerCase();

  if (choice === "lovable") return lovableKey ? lovableBackend(lovableKey) : null;
  if (choice === "openai") return openaiKey ? openaiBackend(openaiKey) : null;
  if (choice === "openrouter" || openrouterKey) return openrouterKey ? openrouterBackend(openrouterKey) : null;
  if (openaiKey) return openaiBackend(openaiKey);
  return lovableKey ? lovableBackend(lovableKey) : null;
}

/** Dictation stays on OpenAI when that key exists. OpenRouter is chat-only. */
export function resolveSpeechBackend(backend: AiBackend): SpeechBackend {
  if (backend.provider === "openrouter") {
    const openaiKey = envValue("OPENAI_API_KEY");
    if (openaiKey) {
      return {
        audioBaseURL: "https://api.openai.com",
        apiKey: openaiKey,
        model: envValue("OPENAI_TRANSCRIBE_MODEL") || DEFAULT_OPENAI_TRANSCRIBE_MODEL,
        buffered: true,
      };
    }
  }
  return {
    audioBaseURL: backend.audioBaseURL,
    apiKey: backend.apiKey,
    model: backend.transcribeModel,
    buffered: backend.provider === "openai",
  };
}

export class GatewayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Shared run id for every agent call of one pipeline turn. */
export function createAgentRunner(apiKey?: string) {
  const backend = resolveAiBackend() ?? (apiKey ? lovableBackend(apiKey) : null);
  if (!backend) throw new GatewayError(500, "AI is not configured. Set OPENROUTER_API_KEY, OPENAI_API_KEY, or LOVABLE_API_KEY.");
  const lovable = backend.provider === "lovable";
  const openrouter = backend.provider === "openrouter";
  let runId: string | undefined;
  const fetchWithRun = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (lovable && runId) headers.set("X-Lovable-AIG-Run-ID", runId);
    const res = await fetch(input, { ...init, headers });
    if (lovable) runId ??= res.headers.get("X-Lovable-AIG-Run-ID")?.trim() || undefined;
    if (!res.ok && res.status !== 200) {
      const text = await res.clone().text().catch(() => "");
      let msg = text;
      try { msg = JSON.parse(text)?.error?.message ?? JSON.parse(text)?.message ?? text; } catch { /* keep */ }
      throw new GatewayError(res.status, msg || `AI request failed (${res.status})`);
    }
    return res;
  };
  const provider = createOpenAI({
    baseURL: backend.baseURL,
    apiKey: backend.apiKey,
    ...(lovable ? { headers: { "Lovable-API-Key": backend.apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" } } : {}),
    ...(openrouter ? { headers: { "X-Title": "Clinical Task Screen" } } : {}),
    fetch: fetchWithRun,
  });

  async function object<T>(opts: { instructions: string; prompt: string; schema: z.ZodType<T>; signal?: AbortSignal }): Promise<T> {
    const result = streamText({
      model: openrouter ? provider.chat(backend.chatModel) : provider.responses(backend.chatModel),
      instructions: opts.instructions,
      prompt: opts.prompt,
      output: Output.object({ schema: opts.schema }),
      ...(opts.signal ? { abortSignal: opts.signal } : {}),
      ...(openrouter
        ? {}
        : {
            providerOptions: {
              openai: lovable
                ? {
                    forceReasoning: true,
                    reasoningEffort: "low",
                    reasoningSummary: "auto",
                    store: false,
                    include: ["reasoning.encrypted_content"],
                  }
                : { store: false },
            },
          }),
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
