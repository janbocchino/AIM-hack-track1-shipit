# Clinical Task Screen: role and task to one card-based screen (Track 1)

A minimal chat with a white background and black text. The clinician enters their role and task by typing or speaking, for example "anaesthetist, pre-op check before breast surgery". The app then shows one screen with only the facts that task needs. Every fact links to its exact source sentence or table row. If something is missing, the screen says "not documented". Contradictions between documents are flagged.

## What the doctor sees

- **Left sidebar**: chats saved in this browser, with "New chat". Each chat has its own page address.
- **Chat mode**: messages are shown as cards, not long text. The input has a microphone for dictation and a phone button for a live voice call.
  - **Task screen card** (main card): a heading with the role and task, then groups of facts set for that role (for example Age, Blood thinners, Allergies, Heart function). Each fact shows its value, a source link with a number, and one of three states: Verified, Needs confirmation or Not documented.
  - **Contradictions card**: two or more passages that conflict, each with its own link, and a short explanation (for example two different dates for the same surgery, or a BMI that does not match the height and weight).
  - **Patient summary card**: shown when the doctor types only a patient's name.
  - **Short answer card**: answers a follow-up question in 1 to 3 sentences, with references.
  - **Timeline window**: diagnoses, procedures, medications and measurements in date order.
- **Source panel**: clicking a reference opens the German original on the right, scrolls to the passage and highlights it, with an English translation underneath.
- **Fact confirmation**: critical facts (anticoagulation, allergies, ASA-relevant findings) are marked "Needs confirmation" until the doctor clicks Confirm or Reject. Rejected facts are logged and feed the learning loop.

## Live voice: split screen

```text
+-------------------------------+------------------------+
|  LIVE TASK SCREEN (left)      |  TRANSCRIPT (right)    |
|  cards rebuilt after each     |  "Show critical info"  |
|  doctor turn; new sections    |  "She has surgery on   |
|  slide in, old ones collapse  |   Friday, breast..."   |
|  into history below           |  ...                   |
+-------------------------------+------------------------+
```

- Right side: everything the doctor says, live, with the assistant's short spoken replies in grey.
- Left side: after each doctor sentence, the context (role, task, procedure) is updated and the task screen is rebuilt. Earlier screens are kept as a stack you can scroll back through.

## Agent system (rules plus AI)

```text
Input (text/voice)
 -> Intent & Context agent   : role, task, patient, procedure (keeps track across voice turns)
 -> Task Profile (HARDCODED) : role x task -> fact types needed (e.g. anaesthesia pre-op:
                               age, weight/BMI, anticoagulants, allergies, cardiac function,
                               renal, airway, prior anaesthesia; excludes tumour receptors)
 -> Retrieval agent          : searches sentence- and row-level index of the 8 documents + JSON
 -> Fact Extractor agents    : one per fact group, run in parallel, must quote the source passage
 -> Contradiction agent      : rules (dates, BMI vs height/weight, laterality, dosages) + AI pass
 -> Verifier (rules + AI)    : quote must exist word for word in the document, else the fact is dropped;
                               value must match the quote; critical facts -> needs confirmation
 -> Composer                 : builds the cards
```

**Hardcoded rules**: only facts from documents; every fact needs a quote that exists in the document; the documents win over the JSON; missing means "Not documented"; values that change over time are not contradictions; no dosage or diagnosis guesses.

**Borrowed from Bridgewater's AIA (a testable system, not a chatbot)**
1. *Specialized agents*: each step above is its own agent with its own prompt and strict output format.
2. *Plan before execution*: a Planner agent turns the task into a visible plan, for example "anticoagulants -> needs medication list + discharge letter; BMI -> needs height and weight from the same letter". The plan lists dependencies and expected outputs. Independent steps run in parallel. The plan is shown as a small collapsible "How this screen was built" row.
3. *Domain knowledge*: a hardcoded clinical knowledge base covering role and task fact profiles, drug classes (for example apixaban counts as an anticoagulant), German and English synonyms, normal ranges and calculation formulas (BMI, weight change).
4. *Domain-aware retrieval*: a Relevance Critic checks each retrieved passage for clinical sense (right patient, right fact type, right time, current or historical) before it is used, instead of relying only on similarity.
5. *Enforced verification*: verification is a required step in code, not left to the model. The quote must exist, the value must match, and calculations are recomputed in code. A fact that fails any check never reaches the screen.
6. *Learning from mistakes*: every rejected or corrected fact becomes a reproducible test case (input situation plus expected fact or "must not appear"). The Evaluation page runs the 5 official situations plus all learned tests and shows the scores (correct answers, traceability, invented facts, contradictions, load time) over time. Confirmed facts become few-shot examples. Real model fine-tuning is out of scope for now. This test-driven loop is the practical version.

## Data needed from you

Please upload the repository's `data/patient-0000-0001/` folder (8 documents plus the JSON files) and `cases/situations.md` and `cases/expected.json`, for example as a ZIP. They stay inside the app's server code and are not published. I'll build the format based on the README and plug your files in as soon as they arrive.

## Technical details

- TanStack Start, shadcn, AI Elements, Geist font, black and white tokens.
- Routes: `/` -> newest chat, `/chat/$threadId`, `/voice/$threadId` (split screen), `/eval`. Chats are stored in localStorage as `UIMessage[]` per thread.
- `/api/chat`: AI SDK `streamText` through the Lovable AI Gateway Responses API with `openai/gpt-6-astra` (reasoning low, for speed). The orchestrator calls these tools: `resolveContext`, `buildTaskScreen` (runs the parallel extractors and verifier on the server), `findContradictions`, `answerQuestion`, `getTimeline` and `searchPatients`. Each tool returns strict-schema JSON that is drawn as a card.
- Document index: documents are split into sentences and table rows with stable IDs (`docId#s12`) on the server at load time. Retrieval uses keywords plus fact-type synonyms in German and English. The verifier checks quotes with a normalized substring match.
- Contradictions are computed and cached per patient, so they don't slow down the 10-second load target.
- Feedback and learned rules are stored in localStorage and sent with each request (no backend needed). A short note at the end explains that this could move to Lovable Cloud later.
- Voice: dictation records WAV and sends it to `openai/gpt-transcribe`. Live voice uses the GPT Live relay `openai/gpt-live-1` with client delegation. Each finished doctor turn calls `resolveContext` and `buildTaskScreen`, and the result is drawn on the left, with the transcript events on the right.
- AGENTS.md records the agent pipeline. Memory records the design and hardcoded clinical rules.
