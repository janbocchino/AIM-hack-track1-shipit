import { describe, expect, it } from "vitest";
import { clashesInside, currentMedications, chartRisks, chartDocuments } from "@/lib/clinical/medications";

describe("current medication", () => {
  it("reads the latest medication list as separate drugs", () => {
    const meds = currentMedications();
    expect(meds.map((m) => m.name)).toEqual(["Letrozole", "Apixaban", "Ramipril", "Levothyroxine"]);
    expect(meds.find((m) => m.id === "apixaban")).toMatchObject({ dose: "5 mg", schedule: "1-0-1" });
    expect(meds.find((m) => m.id === "letrozole")?.dose).toBe("2,5 mg");
    expect(meds[0]?.ref.docId).toBe("D8");
    expect(meds.every((m) => m.ref.segId.startsWith("D8#"))).toBe(true);
  });

  it("finds medicines that cannot be combined with the current list", () => {
    const meds = currentMedications();
    expect(clashesInside(meds)).toEqual([]);
    const apixaban = meds.find((m) => m.id === "apixaban");
    expect(apixaban?.clashes.some((c) => c.severity === "contraindicated" && c.match.includes("rivaroxaban"))).toBe(true);
    expect(meds.find((m) => m.id === "letrozole")?.clashes.some((c) => c.match.includes("tamoxifen"))).toBe(true);
    expect(meds.find((m) => m.id === "ramipril")?.clashes.some((c) => c.match.includes("sacubitril"))).toBe(true);
    expect(meds.find((m) => m.id === "levothyroxine")?.clashes.some((c) => c.severity === "separate")).toBe(true);
  });

  it("flags a clash when two current medicines conflict", () => {
    const meds = currentMedications();
    const letrozole = meds.find((m) => m.id === "letrozole")!;
    const inside = clashesInside([...meds, { ...letrozole, id: "tamoxifen", name: "Tamoxifen", detail: "Tamoxifen 20 mg", clashes: [] }]);
    expect(inside.some((c) => c.taken === "Letrozole" && c.other === "Tamoxifen")).toBe(true);
  });
});

describe("chart groups", () => {
  it("lists safety risks and every document", () => {
    expect(chartRisks().map((r) => r.id)).toEqual(["penicillin", "bleeding", "ponv"]);
    expect(chartDocuments()).toHaveLength(8);
    expect(chartDocuments()[0]?.id).toBe("D1");
  });
});
