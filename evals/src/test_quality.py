import copy
import unittest
from unittest.mock import Mock

from quality import apply_patch, draft_context, review_briefing
from test_clinical import DOCUMENTS, briefing


def empty_patch():
    return {"issues": [], "unresolved": [], "remove_facts": [], "add_facts": [],
            "remove_missing": [], "add_missing": [], "remove_contradictions": [], "add_contradictions": []}


class QualityTests(unittest.TestCase):
    def setUp(self):
        self.draft = briefing()
        self.context = {"role": "Reviewer", "task": "Review test measurements", "as_of": "2016-04-15", "documents": DOCUMENTS}

    def test_no_changes_preserve_original(self):
        result, changes = apply_patch(self.draft, empty_patch(), DOCUMENTS)
        self.assertEqual(result, self.draft)
        self.assertEqual(changes, 0)

    def test_correction_uses_original_evidence_and_removes_false_gap(self):
        patch = empty_patch()
        patch.update(remove_facts=["F0"], remove_missing=["M0"], issues=["Wrong value"])
        corrected = copy.deepcopy(self.draft["facts"][0])
        corrected.update(value="18", sources=[{"evidence_id": "test:L2"}])
        patch["add_facts"] = [corrected]
        result, changes = apply_patch(self.draft, patch, DOCUMENTS)
        self.assertEqual(result["facts"][0]["value"], "18")
        self.assertEqual(result["facts"][0]["sources"][0]["quote"], "Measurement A: 18.")
        self.assertEqual(result["missing"], [])
        self.assertEqual(changes, 3)
        self.assertEqual(self.draft["facts"][0]["value"], "12")

    def test_invalid_removal_or_duplicate_is_rejected(self):
        for removals in [["F9"], ["F0", "F0"]]:
            patch = empty_patch()
            patch["remove_facts"] = removals
            with self.subTest(removals=removals), self.assertRaises(ValueError):
                apply_patch(self.draft, patch, DOCUMENTS)

    def test_invalid_added_reference_is_rejected(self):
        patch = empty_patch()
        fact = copy.deepcopy(self.draft["facts"][0])
        fact["sources"] = [{"evidence_id": "test:L99"}]
        patch["add_facts"] = [fact]
        with self.assertRaises(ValueError):
            apply_patch(self.draft, patch, DOCUMENTS)

    def test_review_receives_record_and_draft_without_eval_answers(self):
        request = Mock(return_value=empty_patch())
        result, status = review_briefing(self.draft, self.context, "fake-key", "fixture", 8, request)
        self.assertEqual(status["status"], "checked")
        self.assertEqual(request.call_count, 1)
        sent = request.call_args.args[2]
        self.assertEqual(set(sent), {"role", "task", "as_of", "documents", "draft"})
        self.assertEqual(sent["draft"]["facts"][0]["id"], "F0")
        self.assertNotIn("quote", sent["draft"]["facts"][0]["sources"][0])
        self.assertEqual(request.call_args.kwargs["timeout"], 8)

    def test_timeout_keeps_draft_but_does_not_claim_pass(self):
        request = Mock(side_effect=TimeoutError())
        result, status = review_briefing(self.draft, self.context, "fake-key", "fixture", 8, request)
        self.assertEqual(result, self.draft)
        self.assertEqual(status["status"], "unavailable")

    def test_unresolved_issues_are_not_marked_checked(self):
        patch = empty_patch()
        patch["unresolved"] = ["Ambiguous measurement date"]
        _, status = review_briefing(self.draft, self.context, "fake-key", "fixture", 8, Mock(return_value=patch))
        self.assertEqual(status["status"], "needs_review")

    def test_draft_ids_do_not_mutate_canonical_sources(self):
        draft_context(self.draft)
        self.assertNotIn("id", self.draft["facts"][0])
        self.assertIn("quote", self.draft["facts"][0]["sources"][0])

    def test_missing_references_are_resolved_to_names_and_deduplicated(self):
        patch = empty_patch()
        patch["add_missing"] = ["M0"]
        result, _ = apply_patch(self.draft, patch, DOCUMENTS)
        self.assertEqual(result["missing"], self.draft["missing"])

    def test_unknown_missing_reference_is_rejected(self):
        patch = empty_patch()
        patch["add_missing"] = ["M99"]
        with self.assertRaises(ValueError):
            apply_patch(self.draft, patch, DOCUMENTS)

    def test_complete_source_draft_uses_one_short_audit_without_rewriting(self):
        request = Mock(return_value={"issues": []})
        result, status = review_briefing(self.draft, self.context, "fake", "fixture", 5, request, True)
        self.assertEqual(result, self.draft)
        self.assertEqual(status["status"], "checked")
        self.assertEqual(status["mode"], "audit")
        self.assertEqual(request.call_count, 1)
        self.assertEqual(request.call_args.kwargs["max_tokens"], 300)

    def test_audit_issues_are_visible_without_mutating_evidence(self):
        request = Mock(return_value={"issues": ["The task needs a measurement date."]})
        result, status = review_briefing(self.draft, self.context, "fake", "fixture", 5, request, True)
        self.assertEqual(result, self.draft)
        self.assertEqual(status["status"], "needs_review")
        self.assertEqual(status["issues_found"], 1)


if __name__ == "__main__":
    unittest.main()
