import { afterEach, describe, expect, it } from "vitest";
import { resolveAiBackend } from "@/lib/clinical/ai.server";

const KEYS = ["OPENAI_API_KEY", "LOVABLE_API_KEY", "AI_PROVIDER", "OPENAI_MODEL", "OPENAI_TRANSCRIBE_MODEL", "OPENAI_BASE_URL", "OPENROUTER_API_KEY", "OPENROUTER_MODEL"] as const;
const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});

function clearKeys() {
  for (const key of KEYS) delete process.env[key];
}

describe("resolveAiBackend", () => {
  it("uses the OpenAI API when OPENAI_API_KEY is set", () => {
    clearKeys();
    process.env.OPENAI_API_KEY = "sk-test";
    expect(resolveAiBackend()).toMatchObject({
      provider: "openai",
      apiKey: "sk-test",
      baseURL: "https://api.openai.com/v1",
      audioBaseURL: "https://api.openai.com",
      chatModel: "gpt-4.1",
      transcribeModel: "gpt-4o-mini-transcribe",
    });
  });

  it("prefers OpenAI when both keys are set", () => {
    clearKeys();
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.LOVABLE_API_KEY = "lv-test";
    process.env.OPENAI_MODEL = "gpt-5";
    expect(resolveAiBackend()?.provider).toBe("openai");
    expect(resolveAiBackend()?.chatModel).toBe("gpt-5");
  });

  it("keeps the Lovable gateway when AI_PROVIDER=lovable", () => {
    clearKeys();
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.LOVABLE_API_KEY = "lv-test";
    process.env.AI_PROVIDER = "lovable";
    expect(resolveAiBackend()).toMatchObject({
      provider: "lovable",
      apiKey: "lv-test",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      chatModel: "openai/gpt-6-astra",
    });
  });

  it("uses the Lovable gateway when only that key is set", () => {
    clearKeys();
    process.env.LOVABLE_API_KEY = "lv-test";
    expect(resolveAiBackend()?.provider).toBe("lovable");
  });

  it("returns null when no key is configured", () => {
    clearKeys();
    expect(resolveAiBackend()).toBeNull();
  });

  it("uses OpenRouter and Gemini when OPENROUTER_API_KEY is set", () => {
    clearKeys();
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    expect(resolveAiBackend()).toMatchObject({
      provider: "openrouter",
      apiKey: "sk-or-test",
      baseURL: "https://openrouter.ai/api/v1",
      chatModel: "google/gemini-3.1-flash-lite",
    });
  });

  it("uses OPENROUTER_MODEL when it is set", () => {
    clearKeys();
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    process.env.OPENROUTER_MODEL = "google/other";
    expect(resolveAiBackend()?.chatModel).toBe("google/other");
  });

  it("keeps OpenAI when AI_PROVIDER=openai", () => {
    clearKeys();
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    process.env.AI_PROVIDER = "openai";
    expect(resolveAiBackend()?.provider).toBe("openai");
    expect(resolveAiBackend()?.chatModel).toBe("gpt-4.1");
  });
});
