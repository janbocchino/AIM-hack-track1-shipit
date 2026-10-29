<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- Clinical pipeline lives in `src/lib/clinical/` (`pipeline.server.ts` orchestrator + agents, `knowledge.ts` hardcoded role/task profiles, `corpus.ts` segment index); UI cards in `src/components/clinical/`. Why: the AI only proposes, and code-enforced verification decides what reaches the screen.
- Every displayed fact, conclusion bullet and timeline event must cite a segment id and pass code verification; facts that fail are shown as "Not documented". Why: zero invented facts is a hard requirement.
- Patient-wide agents (contradictions, timeline) are cached per worker and warmed on app load. Why: the 10-second load-time target.
- Chats, clinician feedback (lessons) and eval runs live in localStorage; lessons are sent with each request and replayed as tests on /eval. Why: no backend needed for the learning loop yet.
- Hands-free mode uses the GPT Live relay (`src/lib/live-relay.server.ts`) with client delegation that calls the same `runTurn` pipeline. Why: one source of truth for voice and text.
