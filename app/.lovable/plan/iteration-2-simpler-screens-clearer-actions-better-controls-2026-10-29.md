# Iteration 2: simpler screens, clearer actions, better controls

## 0. Get the app running
Fix the remaining strict-typing errors (missing-value checks, `process.env["…"]` access, optional props, the AI Elements button size) so the preview loads. Then check every page in the browser.

## 1. Simpler task screen
- **Clear header**: a large task title stating what the screen is for, e.g. "Pre-operative anaesthesia check · Scar correction, left breast", with the role underneath.
- **Show less**: only the facts the profile needs, in 2–3 short labelled groups (e.g. *Risks*, *Body & labs*, *History*). "Not documented" facts collapse into one line at the bottom: "Not documented: Blood group, Airway".
- **Hide technical details**: "How this screen was built" and the timing move into a small "Details" toggle at the bottom.
- **Conclusion box** for pre-op and emergency tasks, at the top: 2–3 bullet points, each with a source link and drawn only from verified facts on the screen. Example: "Anticoagulated (Apixaban 5 mg twice daily) — plan pause", "Penicillin allergy — conflicting documentation", "History of PONV — give prophylaxis". A new **Conclusion agent** writes it, and the verifier rejects any bullet that cites a fact not on the screen.

## 2. Confirm / reject that stands out
- A banner at the top of the card: "3 critical facts need your confirmation", with a "Review" button that scrolls to the first one.
- Each critical fact gets a bordered amber box with large **Confirm** and **Reject** buttons.
- Clicking a fact (or "Why?") expands it in place to show:
  - the exact German quote, highlighted, with its English translation
  - the document name and date
  - whether it conflicts with another document (with both passages)
  - why it counts as critical for this task
- **Reject** asks for an optional reason (for example "outdated" or "wrong value"), which is fed into the learning loop.
- After a decision, the box turns into a small "Confirmed by you" or "Rejected" label.

## 3. Horizontal timeline
- A horizontal timeline from 2015 to 2016 with events as dots: diagnosis, biopsy, tumour board, operation, radiotherapy, start of letrozole, thrombosis, follow-up. Each dot has a short label, and clicking it opens the source.
- **When it shows**:
  - automatically for tasks that need history (oncology follow-up, surgery planning)
  - when the doctor asks for "history" / "Verlauf", together with a small set of key facts
  - otherwise, as a slim one-line collapsed strip at the bottom of the screen
- Events come from the documents through the extraction pipeline, each with a source link. Conflicting dates show as a red split dot.

## 4. Clearer document references
- Replace the cryptic `D4·3` chips with readable chips: "Pre-anaesthetic assessment · 10 Mar 2015". Hovering shows a preview of the quoted sentence.
- Each fact can show its quote inline as a small grey line under the value.
- The source panel keeps the highlight and translation and adds "Previous / next reference" buttons when a fact has several sources.

## 5. Input controls
- The microphone moves next to the send button on the right, as an icon button only.
- "Voice call" is renamed **Hands-free mode**, shown as a small toggle in the top-right corner of the chat header, not in the input box.
- Hands-free mode **starts the call automatically** when the page opens. A large **Mute** button is always visible, next to **Exit hands-free**. If the browser blocks audio, a single "Tap to enable audio" prompt appears.

## 6. Sidebar
- Collapsed by default to a thin icon rail with "New chat", "Chats" and "Evaluation" icons. A toggle button and keyboard shortcut expand it. The open or closed state is remembered in the browser.

## Technical details
- Use the shadcn `Sidebar` with `collapsible="icon"` and `defaultOpen={false}`, persisted through its cookie.
- Add `TurnResult.screen.conclusion: {text, factKeys[]}[]`. The conclusion agent runs after verification, and the code checks that every factKey exists and is not "not_documented".
- Add `TurnResult.timeline: {date, label, refs[], conflict?}[]`. A timeline extractor agent runs in parallel and is cached per patient, like contradictions. Dates must appear in the quoted passage, otherwise the event is dropped.
- Profiles get a `showTimeline` flag and an optional `groups` mapping. A `history` intent is added to the context agent.
- `RefChip` uses English document titles and formatted dates, with a HoverCard preview.
- The voice route calls `call.start()` once on mount, guarded by a ref. If the browser rejects starting without a click, it falls back to the "Tap to start" prompt.
- Update the existing scoring tests and add a test that conclusion bullets are only kept when they cite facts on the screen.
