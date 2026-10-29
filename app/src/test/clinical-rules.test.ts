import { describe, expect, it } from "vitest";
import { verifyConclusion } from "@/lib/clinical/pipeline.server";
import { scoreQuestion } from "@/lib/clinical/scoring";
import type { Fact } from "@/lib/clinical/types";

const ref = { segId: "D8#2", docId: "D8", docTitle: "Nachsorge", date: "2016-04-12", text: "Apixaban 5 mg 1-0-1" };
const facts: Fact[] = [
  { key: "anticoagulation", label: "Blood thinners", value: "Apixaban 5 mg 1-0-1", status: "needs_confirmation", critical: true, refs: [ref] },
  { key: "bloodGroup", label: "Blood group", value: "Not documented", status: "not_documented", critical: true, refs: [] },
];

describe("conclusion verification", () => {
  it("keeps a bullet that cites a documented fact on screen", () => {
    expect(verifyConclusion([{ text: "Anticoagulated", factKeys: ["anticoagulation"], severity: "high" }], facts)).toHaveLength(1);
  });
  it("drops a bullet citing a not-documented fact", () => {
    expect(verifyConclusion([{ text: "Blood group A", factKeys: ["bloodGroup"], severity: "high" }], facts)).toHaveLength(0);
  });
  it("drops a bullet citing a fact that is not on screen", () => {
    expect(verifyConclusion([{ text: "LVEF fine", factKeys: ["cardiac"], severity: "info" }], facts)).toHaveLength(0);
  });
});

describe("benchmark scoring", () => {
  it("needs the expected value plus a source link", () => {
    expect(scoreQuestion({ q: "", factKey: "anticoagulation", expectAny: ["apixaban"] }, facts)).toBe(true);
    expect(scoreQuestion({ q: "", factKey: "anticoagulation", expectAny: ["apixaban"] }, [{ ...facts[0]!, refs: [] }])).toBe(false);
  });
  it("accepts 'not documented' only when the fact is not documented", () => {
    expect(scoreQuestion({ q: "", factKey: "bloodGroup", expectAny: [], notDocumented: true }, facts)).toBe(true);
  });
});
