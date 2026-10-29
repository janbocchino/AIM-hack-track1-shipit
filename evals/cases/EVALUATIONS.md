# Clinical evaluations

**30 checks: 15 true + 15 false, across the five official situations.**

The true checks reuse every question and answer in `expected.json`. Each has one curated false counterpart in `evaluations.json`: wrong medication, allergy, unit, measurement date, histology, receptor status, procedure status, weight-change direction, history, renal result, current dose, follow-up interval/completion or laterality. `evaluation_rules.json` adds required visible details for each positive answer.

“False” means an incorrect or unsupported claim about what this record documents. It does not establish what happened outside the supplied record. The laterality negative says *all* documents consistently show the right side; this avoids incorrectly labelling an actual conflicting right-sided passage as invented.

## Run

Start the app, then from the repository root:

```sh
python3 src/evaluate.py --check    # local suite validation; no API calls
python3 src/evaluate.py            # five briefings + one batched grading call
```

Uses the same `OPENAI_API_KEY` in `src/.env`. The grader defaults to the running app's model. To choose another model:

```sh
python3 src/evaluate.py --judge-model gpt-4.1
```

Reports are saved locally in `src/.cache/evals/latest.md` and `latest.json`. They include per-check reasons, separate true/false scores, request timings, cache flags and full generated briefings. These generated patient outputs are ignored by Git.

Regrade saved outputs without generating five more briefings:

```sh
python3 src/evaluate.py --replay src/.cache/evals/latest.json
```

This makes one grading request. Saved generations survive a grading failure, so replay also recovers from that failure. The suite fingerprint must match. Pending grading is reported as pending, not as a model failure.

## Scoring

- **True check passes:** the model grader accepts the answer, its citations identify allowed reference documents, and mandatory visible-answer patterns pass. Those patterns check key names, values, units, dates and schedules. Missing-information answers need no citation. Source quotes alone do not count as visible answers.
- **False check passes:** the prohibited claim is not asserted as true. Omitting it is sufficient; negated statements and clearly flagged conflicting claims are not false assertions.
- **Request fails:** all six checks for that situation are errors; negative checks receive no automatic credit.
- **Citation check:** references and exact quotations are checked locally for every successful briefing before model grading. This establishes that a passage exists; semantic support for every assertion still needs review.
- **Timing:** cold and cached requests are labelled separately. The under-10-second result is only reported when all five successful requests are uncached.

Generation receives only the role, title, description and cutoff date. Questions, expected answers and false statements are sent exclusively to the grader. The grader sees visible briefing text and citation IDs, with original source quotes removed to prevent source-only details receiving answer credit. Deterministic visible-answer gates can overrule a positive model grade. Patterns accept common equivalent wording but can miss an unfamiliar valid paraphrase; review failed reasons against saved outputs.

One batched grader call reduces cost and time; grades remain model-assisted rather than independent clinical adjudication.

## Runtime quality checker versus benchmark

The app assembles a source-based draft locally, then checks/fills it in one model call using `src/quality.py`. This reviewer receives the task, full record and draft; it receives no benchmark questions or answer keys. Its default network timeout is 5 seconds. The UI explicitly flags an unavailable or unresolved review.

The 30 benchmark checks remain separate. They measure whether final briefings improved and record review status and duration. A normal full run makes five app requests (one model review each), followed by one batched grading request: six model calls total. Cached app results skip review. Report cache flags distinguish genuinely new requests from cached results.

`src/source_facts.py` also fills common task checklists directly from source text and performs weight-change arithmetic locally. Patient values and document IDs are extracted at runtime; the evaluation answer keys and grading patterns remain outside generation. Mutation tests change doses, receptor values, dates, weights and renal/follow-up documentation to verify this separation.

This suite measures answer coverage and 15 specific false claims. It does not prove zero invented facts across every output, measure all five known contradictions, or test unfamiliar roles. It is a focused starting regression suite.

## Tests for the evaluator

```sh
python3 -m unittest discover -s src -p 'test_*.py' -v
```

The evaluator's tests verify balanced coverage, separation of answers from app inputs, grader completeness, rejection of invented item IDs, empty-output behaviour, and error/pending accounting. They use invented fixtures and require no API key.
