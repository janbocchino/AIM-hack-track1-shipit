# Clinical accuracy handoff

This folder is a standalone copy of the prototype's accuracy pipeline, evaluator, tests and reference app. The original files remain in their existing locations. Changes made here do not automatically update the original, or vice versa.

## What's included

- `src/clinical.py`: document preparation, passage IDs and evidence validation.
- `src/source_facts.py`: rule-based fact extraction, calculations and selected contradiction checks.
- `src/quality.py`: AI review and correction of a source-based draft.
- `src/server.py` and `src/static/`: a reference backend and UI showing how the pipeline is called and presented.
- `src/evaluate.py`, `src/test_*.py` and `cases/`: automated tests and the five-scenario, 30-check evaluation suite. See `cases/EVALUATIONS.md` for scoring and limits.

The pipeline is designed around the supplied German synthetic documents and known task patterns. Evidence validation confirms a passage exists, not that it semantically supports a claim. AI review and model-assisted evaluation do not guarantee clinical accuracy; test unfamiliar records and tasks separately. This is a local prototype, not a production clinical system.

## Run the checks

Requires Python 3.10+; no third-party Python packages. From this folder:

```sh
python3 -m unittest discover -s src -p 'test_*.py' -v
python3 src/evaluate.py --check
```

These commands use synthetic test fixtures and require no API key or patient documents.

## Run the reference app and evaluation

1. Place the supplied patient folder at `data/patient-0000-0001/` inside this folder, with its `documents/*.json` files. Alternatively, set `DATA_DIR` to the absolute path of that patient folder. Patient data is not included in this handoff.
2. Copy `src/.env.example` to `src/.env` and add `OPENAI_API_KEY`. The default model is `gpt-4.1-mini`; configure `OPENAI_MODEL`, `QUALITY_MODEL` or `QUALITY_TIMEOUT_SECONDS` if needed.
3. Run `python3 src/server.py` and open `http://localhost:8000`.
4. With the server running, run `python3 src/evaluate.py` in another terminal. This makes five briefing requests and one model-assisted grading request; reports are saved in `src/.cache/evals/`. The full evaluation requires the original scenario documents and an API key. Provider usage may incur charges.

The reference API accepts `POST /api/briefing` with JSON fields `role`, `task` and `as_of` (YYYY-MM-DD). It returns `briefing` (`facts`, `missing`, `contradictions`), `quality`, `as_of`, `seconds` and `cached`. `GET /api/context` returns the normalized source documents and configuration status. `server.py` is a local-only reference: it has no authentication or production deployment support.

## Sharing

Do not include `.env`, patient documents, generated reports or other derived patient outputs when sharing. The included `cases/` files contain scenario descriptions and expected synthetic patient findings; review whether the recipient is permitted to receive these before sharing. The original repository instructions prohibit publishing the supplied data. This folder's `.gitignore` helps exclude local data, credentials and reports, but does not remove files already tracked in Git or Git history.
