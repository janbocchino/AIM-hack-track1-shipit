# ClearChart — Clinical Compass

A clinical task-screen prototype for AIM Hackathon Track 1. A clinician describes
their role and task, and the app builds a patient screen with source-linked facts,
contradictions, a timeline, and a clinical summary. Text chat, dictation, and a
hands-free voice screen share the clinical pipeline.

## Repository layout

| Folder | Contents |
| --- | --- |
| [`app/`](app/) | Runnable TanStack Start / React / TypeScript application, configuration, lockfile, and tests |
| [`resources/`](resources/) | Original hackathon brief, supplied cases, and reference data |
| [`resources/README.md`](resources/README.md) | Track requirements, judging criteria, and submission instructions |
| [`resources/cases/`](resources/cases/) | Official situations and expected answers |
| [`resources/data/`](resources/data/) | Existing IBM reference dataset; see its [data guide](resources/data/README.md) |

The original repository materials are grouped under `resources/`; the application
is self-contained under `app/`. Run application commands from `app/`.

## Run locally

Use Node.js 22.12 or newer and Bun 1.3 or newer. The export includes `bun.lock`;
use it to install the recorded dependency versions.

```sh
git clone https://github.com/janbocchino/AIM-hack-track1-shipit.git
cd AIM-hack-track1-shipit/app
bun install --frozen-lockfile
cp .env.example .env
```

Set `LOVABLE_API_KEY` in `app/.env` to a key with access to the Lovable AI gateway,
then start the app:

```sh
bun --env-file=.env run dev
```

Open the local URL printed by Vite. AI requests require the gateway key and network
access. Voice input also requires browser microphone permission.

```sh
bun run test       # Existing routing and clinical-rule tests
bun run build      # Production build
bun run lint       # Existing ESLint / Prettier rules
```

See the [application guide](app/README.md) for implementation details and current
limitations.

## Architecture

- **UI and server routes:** TanStack Start, React 19, TypeScript, Tailwind CSS,
  and Radix UI. Clinical cards and source inspection live in
  `app/src/components/clinical/`; page and API routes live in `app/src/routes/`.
- **Clinical pipeline:** `app/src/lib/clinical/pipeline.server.ts` coordinates
  intent detection, role/task profiles, fact extraction, contradictions, timelines,
  and conclusions. `corpus.ts` assigns citable segment IDs to document lines;
  verification rules check proposed facts and references before display.
- **AI:** Server-side calls use the Vercel AI SDK and the Lovable AI gateway,
  currently configured for `openai/gpt-6-astra`. Transcription uses
  `openai/gpt-transcribe`; live voice uses `openai/gpt-live-1` with the same clinical
  pipeline delegated through `app/src/lib/live-relay.server.ts`. Credentials stay
  in the server environment.
- **State and evaluation:** Chats, clinician feedback, and evaluation runs are
  stored in browser localStorage. The `/eval` page runs the app's bundled sample
  situations and feedback checks.

## Data and prototype status

The app currently reads its own synthetic sample in
`app/src/lib/clinical/data.ts` and sample situations in `cases.ts`. It does **not**
load `resources/data/` or the official cases automatically. Its sample evaluation
results therefore do not establish performance on the official benchmark.

The supplied IBM reference data was already tracked in this private repository.
The [original brief](resources/README.md#rules) requires excluding that data from
a public submission. Keep this repository private while it contains those files;
prepare any public submission without the dataset or its Git history. Local
secrets, dependencies, build output, and ZIP exports are excluded from new commits.
