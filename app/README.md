# ClearChart application

This folder contains the extracted Lovable application. The repository's
[main README](../README.md) covers setup, architecture, and the distinction
between the app's synthetic sample and the supplied hackathon dataset.

## Development

Run commands from this directory with Node.js 22.12+ and Bun 1.3+:

```sh
bun install --frozen-lockfile
cp .env.example .env
# Set LOVABLE_API_KEY in .env before starting the server.
bun --env-file=.env run dev
```

The gateway key is read by server functions for clinical responses, translation,
transcription, and live voice. Never expose it through a `VITE_` environment
variable or commit a populated environment file.

## Commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the Vite development server |
| `bun run test` | Run the existing Vitest suite |
| `bun run test:watch` | Run Vitest in watch mode |
| `bun run build` | Build the production client and server |
| `bun run preview` | Preview the configured production build |
| `bun run lint` | Run the existing ESLint and Prettier checks |
| `bun run format` | Apply Prettier formatting |

## Source map

- `src/routes/`: home, text chat, live voice, evaluation, and transcription API.
- `src/components/clinical/`: application shell, clinical cards, source panel,
  composer, and timeline.
- `src/lib/clinical/`: document corpus, role/task profiles, AI orchestration,
  citation checks, scoring, and local state.
- `src/lib/voice/`, `src/hooks/use-live-voice.ts`, and
  `src/lib/live-relay.server.ts`: dictation, audio recording, and voice relay.
- `live-vite-plugin.ts`: development WebSocket relay for `/api/live`.
- `src/test/`: existing routing and clinical-rule tests.
- `.lovable/`: export metadata and implementation plans.

## Current limitations

The source and sample situations are imported from the ZIP export. The app does
not yet ingest the supplied files in [`../resources/data/`](../resources/data/)
or run the official [`../resources/cases/`](../resources/cases/) benchmark. No
official metric results are claimed by this import.

AI and voice functionality require a working gateway account. Unit tests exercise
local rules and routing; they do not validate live model responses or microphone
behavior. Live voice has separate development and worker WebSocket connectors,
so deployment requires a compatible server runtime. The exported Vite configuration
uses Lovable's TanStack configuration, including its production Nitro target.

Chats, feedback, and evaluation history are browser-local rather than shared
between users. This application was built with [Lovable](https://lovable.dev);
the original project instructions remain in [AGENTS.md](AGENTS.md).

## Import validation

Validated with Node.js 26.0.0 and Bun 1.4.4 using the frozen lockfile:

- `bun install --frozen-lockfile`: passed.
- `npm test`: all 6 tests passed across 2 files.
- `npm run build`: production client and server build passed.
- `npm run lint`: the unchanged export has 554 Prettier formatting errors and
  17 warnings (16 React Fast Refresh warnings and 1 hook dependency warning).

Application source and lockfile match the ZIP export. Import changes are limited
to documentation, ignore rules, and an empty environment template. Live AI and
voice calls were not exercised.
