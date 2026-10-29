import copy
import json
import unittest
from unittest.mock import patch

from evaluate import (build_report, enforce_visible_requirements, grade, grading_schema,
                      load_suite, missing_visible_requirements, validate_grades, visible_items)


class SuiteTests(unittest.TestCase):
    def test_balanced_suite_covers_all_official_questions(self):
        suite = load_suite()
        checks = [c for s in suite for c in s["checks"]]
        self.assertEqual(len(suite), 5)
        self.assertEqual(len(checks), 30)
        self.assertEqual(sum(c["truth"] for c in checks), 15)
        self.assertEqual(len({c["id"] for c in checks}), 30)
        for reference in {c["reference"] for c in checks}:
            self.assertEqual({c["truth"] for c in checks if c["reference"] == reference}, {True, False})

    def test_questions_and_answers_are_not_in_generation_tasks(self):
        for scenario in load_suite():
            task = scenario["title"] + "\n" + scenario["description"]
            self.assertNotIn("1. ", task)
            for check in scenario["checks"]:
                self.assertNotIn(check["question"], task)
                self.assertNotIn(check["reference_answer"], task)

    def test_false_statements_are_distinct_mutations(self):
        false = [c for s in load_suite() for c in s["checks"] if not c["truth"]]
        self.assertEqual(len({c["statement"] for c in false}), 15)
        for check in false:
            self.assertNotEqual(check["statement"], check["reference_answer"])


class GradingTests(unittest.TestCase):
    def setUp(self):
        self.suite = [{"id": "1", "title": "Invented scenario", "description": "Review test record.",
                       "role": "Reviewer", "as_of": "2016-04-15", "checks": [
            {"id": "yes", "truth": True, "category": "fixture"},
            {"id": "no", "truth": False, "category": "fixture"}]}]
        self.runs = [{"scenario_id": "1", "briefing": {"facts": [
            {"label": "Fixture", "value": "12", "date": "2016", "status": "documented", "sources": []}],
            "missing": [], "contradictions": []}, "error": None, "seconds": 2, "cached": False}]
        self.grades = {"checks": [
            {"id": "yes", "passed": True, "reason": "Visible correct fact.", "item_ids": ["fact:0"]},
            {"id": "no", "passed": True, "reason": "Incorrect statement is absent.", "item_ids": []}]}

    def test_accepts_complete_grades(self):
        self.assertEqual(len(validate_grades(self.grades, self.suite, self.runs)), 2)

    def test_grading_schema_constrains_all_checks_and_evidence_ids(self):
        contexts = [{"checks": self.suite[0]["checks"], "visible_items": visible_items(self.runs[0]["briefing"])}]
        checks = grading_schema(contexts)["properties"]["checks"]
        self.assertEqual(set(checks["required"]), {"yes", "no"})
        passing = checks["properties"]["yes"]["anyOf"][0]["properties"]
        self.assertEqual(passing["item_ids"]["items"]["enum"], ["fact:0"])
        self.assertEqual(passing["item_ids"]["minItems"], 1)
        self.assertEqual(passing["passed"]["enum"], [True])
        failing_negative = checks["properties"]["no"]["anyOf"][1]["properties"]
        self.assertEqual(failing_negative["item_ids"]["minItems"], 1)

    def test_empty_briefing_grading_schema_requires_empty_references(self):
        contexts = [{"checks": self.suite[0]["checks"], "visible_items": []}]
        ids = grading_schema(contexts)["properties"]["checks"]["properties"]["yes"]["properties"]["item_ids"]
        self.assertEqual(ids["maxItems"], 0)

    def test_batched_provider_result_is_parsed_and_validated(self):
        result = {"checks": {row["id"]: {k: v for k, v in row.items() if k != "id"} for row in self.grades["checks"]}}
        response = {"status": "completed", "output": [{"content": [{"type": "output_text", "text": json.dumps(result)}]}]}
        with patch("evaluate.post_json", return_value=response) as provider:
            self.assertEqual(grade(self.suite, self.runs, "fixture", "fake-key"), self.grades["checks"])
            self.assertEqual(provider.call_count, 1)

    def test_empty_output_cannot_pass_positive_checks(self):
        self.runs[0]["briefing"]["facts"] = []
        self.grades["checks"][0].update(passed=False, item_ids=[], reason="Required answer missing.")
        grades = validate_grades(self.grades, self.suite, self.runs)
        report = build_report(self.suite, self.runs, grades, "model", "judge")
        self.assertEqual(report["true_checks"]["passed"], 0)
        self.assertEqual(report["false_checks"]["passed"], 1)

    def test_missing_and_duplicate_grades_are_rejected(self):
        for checks in [self.grades["checks"][:1], [self.grades["checks"][0]] * 2]:
            with self.subTest(checks=checks), self.assertRaises(ValueError):
                validate_grades({"checks": checks}, self.suite, self.runs)

    def test_passing_positive_and_failing_negative_require_visible_evidence(self):
        self.grades["checks"][0]["item_ids"] = []
        with self.assertRaises(ValueError):
            validate_grades(self.grades, self.suite, self.runs)
        self.grades["checks"][0]["item_ids"] = ["fact:0"]
        self.grades["checks"][1]["passed"] = False
        with self.assertRaises(ValueError):
            validate_grades(self.grades, self.suite, self.runs)

    def test_invented_evidence_and_string_booleans_are_rejected(self):
        for field, value in [("item_ids", ["fact:99"]), ("passed", "true")]:
            grades = copy.deepcopy(self.grades)
            grades["checks"][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate_grades(grades, self.suite, self.runs)

    def test_request_failure_never_awards_negative_passes(self):
        self.runs[0].update(error="Request failed", briefing=None)
        report = build_report(self.suite, self.runs, [], "model", "judge")
        self.assertEqual(report["true_checks"]["errors"], 1)
        self.assertEqual(report["false_checks"]["errors"], 1)
        self.assertEqual(report["false_checks"]["passed"], 0)

    def test_ungraded_results_are_pending_not_failures(self):
        report = build_report(self.suite, self.runs, [], "model", "judge")
        self.assertEqual(report["true_checks"]["pending"], 1)
        self.assertEqual(report["true_checks"]["failed"], 0)

    def test_conflicting_claims_are_not_treated_as_asserted_facts(self):
        self.runs[0]["briefing"]["contradictions"] = [{"claims": [{"text": "Wrong claim"}]}]
        items = visible_items(self.runs[0]["briefing"])
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], "fact:0")


class VisibleAnswerTests(unittest.TestCase):
    def setUp(self):
        self.suite = load_suite()
        self.checks = {c["reference"]: c for s in self.suite for c in s["checks"] if c["truth"]}

    def brief(self, label, value, date="Date not documented", sources=None):
        return {"facts": [{"label": label, "value": value, "date": date, "status": "planned", "sources": sources or []}],
                "missing": [], "contradictions": []}

    def test_source_only_surgical_date_does_not_count_as_visible(self):
        briefing = self.brief("Recommended surgical procedure", "Quadrantectomy with IORT", "2016-04-15",
                              [{"quote": "Surgery scheduled 16.05.2016"}])
        self.assertIn("16 May 2016 surgery date", missing_visible_requirements(self.checks["2.3"], briefing))

    def test_visible_surgical_date_accepts_equivalent_formats(self):
        for date in ["2016-05-16", "16.05.2016", "16 May 2016", "May 16, 2016"]:
            briefing = self.brief("Recommended surgical procedure", "Quadrantectomy with IORT", date)
            with self.subTest(date=date):
                self.assertEqual(missing_visible_requirements(self.checks["2.3"], briefing), [])

    def test_incomplete_receptor_details_fail(self):
        briefing = self.brief("Tumour diagnosis", "HER2 negative, Ki67 20%")
        missing = missing_visible_requirements(self.checks["2.2"], briefing)
        self.assertIn("ER 100%", missing)
        self.assertIn("Allred 8", missing)

    def test_weight_values_alone_do_not_count_as_calculated_change(self):
        briefing = self.brief("Weight change", "78 kg in 2015, 67 kg then 66 kg in 2016")
        self.assertIn("explicit approximately 12 kg loss", missing_visible_requirements(self.checks["3.3"], briefing))
        briefing["facts"][0]["value"] += "; lost approximately 12 kg."
        self.assertEqual(missing_visible_requirements(self.checks["3.3"], briefing), [])

    def test_missing_follow_up_entry_is_a_visible_answer(self):
        briefing = {"facts": [], "missing": ["Follow-up carotid ultrasound completion"], "contradictions": []}
        self.assertEqual(missing_visible_requirements(self.checks["5.2"], briefing), [])

    def test_positive_grader_pass_is_overruled_when_answer_is_missing(self):
        scenario = next(s for s in self.suite if s["id"] == "2")
        runs = [{"scenario_id": "2", "briefing": self.brief("Surgical procedure", "Quadrantectomy with IORT", "2016-04-15")}]
        grades = [{"id": "2.3.true", "passed": True, "reason": "Present.", "item_ids": ["fact:0"]}]
        corrected = enforce_visible_requirements([scenario], runs, grades)
        self.assertFalse(corrected[0]["passed"])
        self.assertTrue(grades[0]["passed"])


if __name__ == "__main__":
    unittest.main()
