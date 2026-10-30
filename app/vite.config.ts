// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { liveVoiceDev } from "./live-vite-plugin";

// Vite keeps an existing env var over .env, and `bun run dev` leaves
// OPENAI_API_KEY as an empty string. Drop those blanks so the file applies.
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

const envFile = resolve(process.cwd(), ".env");
if (existsSync(envFile) && typeof process.loadEnvFile === "function") {
  for (const key of SERVER_ENV_KEYS) {
    if (!process.env[key]?.trim()) delete process.env[key];
  }
  process.loadEnvFile(envFile);
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: { plugins: [liveVoiceDev()] },
});
