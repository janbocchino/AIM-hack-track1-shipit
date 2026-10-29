# Data

This is a copy of IBM's Medical Cockpit demo for one synthetic patient. IBM Austria provides it for this hackathon. The Cockpit itself is linked in the main README. This copy comes from an earlier version of the Cockpit's pipeline, so the live Cockpit can show slightly different counts.

## Files

All files are in `patient-0000-0001/`.

| File | What it contains |
|---|---|
| `patient.json` | Name, sex, date of birth, latest hospital stay and `age`, which is her age today (67) |
| `documents.json` | List of the eight documents: title, date, type, department and hospital stay |
| `documents/<id>.json` | Full text of one document, in the field `text` |
| `diagnoses.json` | Diagnoses as a tree: chapter, then condition, then diagnosis, then mention. Each of the 73 diagnoses has a status: `positive`, `negative` (ruled out), `suspected` or `statuspost` (in the past, for example after an operation). 69 of them have an ICD-10 code. A mention has the matched text, a date and `documentIds`. There are 105 mentions |
| `procedures.json` | Procedures as a tree. Each of the 49 procedures has a status: `positive` (done), `statuspost` (done in the past) or `recommended`. 44 of them have a code from MEL, the Austrian procedure catalogue. A mention has the matched text, a date and `documentIds` |
| `medication.json` | Medication as a tree, grouped by drug class. 11 of the 12 entries at the ingredient level have an ATC code. A mention has the matched text (with the dose where the document gives it), a date and `documentIds`. There are 22 mentions |
| `scores-all.json` | Measurements over time, such as blood pressure, BMI, weight, HbA1c (long-term blood sugar), ejection fraction (how much blood the heart pumps out with each beat) and BI-RADS (breast imaging category, 5 means very likely cancer). Each value has a date and `documentIds` |
| `scores-latest.json` | The latest value of each measurement |
| `cave.json` | Warnings (CAVE is the German clinical label for them). There is one entry, "Arzneimittel-Allergie" (drug allergy), without `documentIds`. The letters show it is a contrast media allergy |
| `metadata.json` | Values for filtering: document types, hospital stays, divisions and hospitals |

`documentIds` refers to the files in `documents/`.

## Notes

- All text is in German. The documents call the patient "Beispielpatientin" or "NN_0000-0001".
- Line breaks in the document text are written as `<BR>` and some characters as HTML entities, such as `&gt;` for `>`.
- The matched text in IBM's extraction can contain markup such as `<SPAN class="spellcorrection">` and extra spaces, so it is not always an exact copy of the document text.
- Both discharge letters end with an empty lab table. This is intended: apart from HbA1c, no lab values are documented.
- All diagnosis, medication and measurement dates have only a month and year, for example `2016-04-xx`. Only 9 of 62 procedure dates have a day.
- The extraction is automatic. Which fragments count as a concept is a configuration decision, so a procedure such as `zur sonographisch` appears here and not in the live Cockpit. Use the JSON as an index and the documents as the source.
- The details in `documents.json` and `patient.json`, such as dates of hospital stays, can differ from the document text. The text is the source of truth.
- Some documents contradict themselves or each other. The Contradictions metric in the main README counts how many your app points out.
- In the medication tables, the four numbers are morning, midday, evening and night, so `1 0 0 0` means one dose in the morning. `cases/expected.json` leaves out the night column and writes this as 1-0-0.
