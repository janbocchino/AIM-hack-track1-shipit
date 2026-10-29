import unittest
from datetime import date

from clinical import validate_briefing
from source_facts import coverage_complete, ensure_coverage, extract, prepare_draft, retain_source_conflicts, source_conflicts


def document(identity, text, wrong_index_date="2099-01-01"):
    return {"id": identity, "title": "Invented fixture", "index_date": wrong_index_date,
            "passages": [{"id": f"L{i+1}", "text": line} for i, line in enumerate(text)]}


def empty():
    return {"facts": [], "missing": [], "contradictions": []}


class SourceFactTests(unittest.TestCase):
    def context(self, docs, task="Review diabetes", cutoff="2021-06-30"):
        return {"role": "GP", "task": task, "as_of": cutoff, "documents": docs}

    def test_weight_values_and_change_are_read_from_sources_not_answer_keys(self):
        docs = [document("old", ["Ort, am 03.02.2020", "Gewicht: 91 kg"]),
                document("middle", ["Ort, am 03.03.2021", "Gewicht: 88 kg"]),
                document("new", ["Ort, am 10.06.2021", "Gewicht: 85 kg"])]
        result, _ = ensure_coverage(empty(), self.context(docs))
        weight = next(f for f in result["facts"] if "weight" in f["label"])
        self.assertIn("91 kg", weight["value"])
        self.assertIn("88 kg", weight["value"])
        self.assertIn("85 kg", weight["value"])
        self.assertIn("Weight loss: 6 kg", weight["value"])
        self.assertIn("85 - 91 = -6 kg", weight["value"])
        validate_briefing(result, docs)

    def test_weight_gain_and_decimal_measurements(self):
        docs = [document("a", ["Ort, am 01.01.2020", "Gewicht: 51,5 kg"]),
                document("b", ["Ort, am 01.01.2021", "Gewicht: 54 kg"])]
        catalog, _, _ = extract(docs, date(2021, 6, 30))
        self.assertIn("Weight gain: 2.5 kg", catalog["weight"]["value"])

    def test_outpatient_visit_date_precedes_letter_date(self):
        docs = [document("old", ["Ort, am 01.01.2020", "Gewicht: 80 kg"]),
                document("visit", ["Ort, am 04.06.2021", "Die Patientin, welche am 02.06.2021 an unserer Abteilung in Behandlung war.", "Gewicht: 75 kg"])]
        catalog, _, _ = extract(docs, date(2021, 6, 30))
        self.assertIn("2 June 2021", catalog["weight"]["value"])

    def test_latest_dose_and_record_cutoff_use_letter_text_not_metadata(self):
        docs = [document("a", ["Ort, am 01.01.2020", "Blopress 8mg oral 1 0 1/2 0 ST"]),
                document("b", ["Ort, am 01.01.2021", "Blopress 12mg oral 1 0 1 0 ST"]),
                document("future", ["Ort, am 01.01.2022", "Blopress 24mg oral 1 0 0 0 ST"])]
        catalog, _, _ = extract(docs, date(2021, 6, 30))
        self.assertIn("12 mg", catalog["antihypertensive"]["value"])
        self.assertIn("1-0-1-0", catalog["antihypertensive"]["value"])
        self.assertIn("2021-01-01", catalog["antihypertensive"]["date"])

    def test_renal_missing_is_checked_against_every_document(self):
        docs = [document("a", ["Ort, am 01.01.2021", "Labor: keine Tabelle"])]
        result, _ = ensure_coverage(empty(), self.context(docs, "Emergency contrast imaging"))
        self.assertTrue(any("Kidney function" in m for m in result["missing"]))
        docs.append(document("lab", ["Ort, am 02.01.2021", "Kreatinin: 0,9 mg/dl"]))
        result, _ = ensure_coverage(empty(), self.context(docs, "Emergency contrast imaging"))
        self.assertFalse(any("Kidney function" in m for m in result["missing"]))

    def test_noncontrast_ct_is_supported_by_original_passage(self):
        docs = [document("ct", ["Ort, am 01.01.2021", "Schädel-CT (nativ aufgrund einer bekannten KM-Allergie) unauffällig."])]
        result, _ = ensure_coverage(empty(), self.context(docs, "Emergency contrast imaging"))
        self.assertIn("without contrast", result["facts"][0]["value"])
        validate_briefing(result, docs)

    def test_receptor_values_follow_mutated_document_values(self):
        docs = [document("path", ["Ort, am 01.01.2021",
                "Östrogenrezeptor: positiv (85% rezeptorpositive Tumorzellen) Allred-Score: 6 Progesteronrezeptor: positiv (45% rezeptorpositive Tumorzellen) Allred-Score: 5 Her2neu-Expression: positiv",
                "Ki67-Proliferationsrate: 35%"])]
        catalog, _, _ = extract(docs, date(2021, 6, 30))
        for value in ["85%", "Allred 6", "45%", "Allred 5", "HER2 positive", "Ki-67 35%"]:
            self.assertIn(value, catalog["receptors"]["value"])

    def test_unfamiliar_task_preserves_model_result(self):
        draft = empty()
        result, count = ensure_coverage(draft, self.context([], "Review hearing loss"))
        self.assertEqual(result, draft)
        self.assertEqual(count, 0)

    def test_followup_completion_is_not_declared_missing_if_later_record_exists(self):
        docs = [document("a", ["Ort, am 01.01.2020", "Regelmäßige Blutdruckkontrollen und Anpassung durch den Hausarzt. Regelmäßige Augenkontrollen. Duplexsonographie der Karotisgefäße in 3 Monaten."]),
                document("b", ["Ort, am 01.04.2020", "Carotis Duplexsonographie durchgeführt."])]
        _, _, absent = extract(docs, date(2021, 6, 30))
        self.assertFalse(absent)

    def test_stale_combined_medication_summary_is_replaced(self):
        docs = [document("current", ["Ort, am 01.01.2021", "Blopress 12mg oral 1 0 1 0 ST"])]
        draft = empty()
        draft["facts"] = [{"label": "Hypertension history and treatment", "value": "Blopress old schedule",
                           "date": "2021", "status": "documented", "sources": [{"document_id": "current", "passage_id": "L2", "quote": docs[0]["passages"][1]["text"]}]}]
        result, _ = ensure_coverage(draft, self.context(docs, "Emergency contrast imaging"))
        self.assertEqual(len(result["facts"]), 1)
        self.assertNotIn("old schedule", result["facts"][0]["value"])

    def test_bmi_conflict_is_calculated_from_changed_measurements(self):
        docs = [document("bmi", ["Ort, am 01.01.2021", "Größe: 180 cm", "Gewicht: 81 kg", "BMI: 31"])]
        conflicts = source_conflicts(docs, date(2021, 6, 30))
        self.assertEqual(len(conflicts), 1)
        self.assertIn("25.0", conflicts[0]["claims"][1]["text"])
        validate_briefing({**empty(), "contradictions": conflicts}, docs)

    def test_rounding_and_weight_change_are_not_conflicts(self):
        docs = [document("a", ["Ort, am 01.01.2020", "Größe: 180 cm", "Gewicht: 81 kg", "BMI: 25.1"]),
                document("b", ["Ort, am 01.01.2021", "Größe: 180 cm", "Gewicht: 84 kg", "BMI: 25.9"])]
        self.assertEqual(source_conflicts(docs, date(2021, 6, 30)), [])

    def test_conflicting_admission_and_discharge_dates(self):
        docs = [document("dates", ["Ort, am 15.01.2021", "Aufnahme am 10/01/2021 | Entlassen am 15/01/20211",
                "Frau X wurde am 12.01.2021 auf der Station aufgenommen.",
                "Die Patientin wurde am 15.01.2021 nach Hause entlassen."])]
        conflicts = source_conflicts(docs, date(2021, 6, 30))
        self.assertEqual(len(conflicts), 2)
        validate_briefing({**empty(), "contradictions": conflicts}, docs)

    def test_correct_dates_and_explicit_readmission_do_not_trigger(self):
        docs = [document("dates", ["Ort, am 15.01.2021", "Aufnahme am 10/01/2021 | Entlassen am 15/01/2021",
                "Frau X wurde am 10.01.2021 auf der Station aufgenommen.",
                "Frau X wurde am 12.01.2021 erneut auf der Station aufgenommen.",
                "Die Patientin wurde am 15.01.2021 nach Hause entlassen."])]
        self.assertEqual(source_conflicts(docs, date(2021, 6, 30)), [])

    def test_conflicts_remain_if_ai_removes_them_without_duplicate_sources(self):
        docs = [document("bmi", ["Ort, am 01.01.2021", "Größe: 180 cm", "Gewicht: 81 kg", "BMI: 31"])]
        context = self.context(docs, "Diabetes review")
        draft, _ = prepare_draft(context)
        restored = retain_source_conflicts(empty(), draft)
        self.assertEqual(len(restored["contradictions"]), 1)
        self.assertEqual(len(retain_source_conflicts(restored, draft)["contradictions"]), 1)

    def test_age_uses_birthdate_and_requested_cutoff(self):
        docs = [document("birth", ["Ort, am 01.01.2021", "Patientin geb. 20.07.1990"])]
        catalog, _, _ = extract(docs, date(2021, 6, 30))
        self.assertIn("30 years old", catalog["age"]["value"])
        catalog, _, _ = extract(docs, date(2021, 8, 1))
        self.assertIn("31 years old", catalog["age"]["value"])

    def test_incomplete_or_unfamiliar_tasks_need_model_fill(self):
        self.assertFalse(coverage_complete(self.context([], "Pre-operative anaesthesia check")))
        self.assertFalse(coverage_complete(self.context([], "Review hearing loss")))


if __name__ == "__main__":
    unittest.main()
