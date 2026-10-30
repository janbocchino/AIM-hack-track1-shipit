import { existsSync } from "node:fs";
import { resolve } from "node:path";

const SERVER_ENV_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_TRANSCRIBE_MODEL",
  "OPENAI_BASE_URL",
  "LOVABLE_API_KEY",
  "AI_PROVIDER",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
] as const;

let loaded = false;

/**
 * Fill server secrets from app/.env.
 * An empty variable already in the process blocks Node and Vite from applying
 * the file, which is what `bun run dev` hits for OPENAI_API_KEY.
 */
export function loadServerEnv() {
  if (loaded || process.env.VITEST) return;
  loaded = true;
  const envFile = resolve(process.cwd(), ".env");
  if (!existsSync(envFile) || typeof process.loadEnvFile !== "function") return;
  for (const key of SERVER_ENV_KEYS) {
    if (!process.env[key]?.trim()) delete process.env[key];
  }
  process.loadEnvFile(envFile);
}

export function serverEnv(name: string) {
  loadServerEnv();
  return process.env[name]?.trim() ?? "";
}
