// Current medicines are read from the chart (latest "Medikation" line).
// Clash lists are a built-in set of major interactions for those drugs.
import { DOCUMENTS, type SourceDoc } from "./data";
import type { Ref } from "./types";

export type ClashSeverity = "contraindicated" | "avoid" | "separate";

export type Clash = {
  id: string;
  severity: ClashSeverity;
  title: string;
  examples: string[];
  /** Lowercase names used to see if another current medicine is in this clash list. */
  match: string[];
  reason: string;
};

export type DrugDef = {
  id: string;
  name: string;
  aliases: string[];
  drugClass: string;
  clashes: Clash[];
};

export type CurrentMed = {
  id: string;
  name: string;
  drugClass: string;
  dose: string;
  schedule: string;
  detail: string;
  ref: Ref;
  clashes: Clash[];
};

export type ChartRisk = {
  id: string;
  title: string;
  detail: string;
  ref: Ref;
};

export type InListClash = {
  id: string;
  taken: string;
  other: string;
  severity: ClashSeverity;
  reason: string;
};

const DRUGS: DrugDef[] = [
  {
    id: "letrozole",
    name: "Letrozole",
    aliases: ["letrozol", "letrozole"],
    drugClass: "Aromatase inhibitor",
    clashes: [
      {
        id: "letrozole-tamoxifen",
        severity: "contraindicated",
        title: "Tamoxifen",
        examples: ["Tamoxifen"],
        match: ["tamoxifen"],
        reason: "Tamoxifen lowers letrozole levels. They are alternative endocrine therapies and are not taken together.",
      },
      {
        id: "letrozole-oestrogen",
        severity: "contraindicated",
        title: "Oestrogen therapy",
        examples: ["HRT", "ethinylestradiol", "combined oral contraceptives"],
        match: ["ethinylestradiol", "estradiol", "östrogen", "estrogen", "hormonersatz"],
        reason: "Oestrogen works against letrozole in hormone-receptor-positive breast cancer.",
      },
    ],
  },
  {
    id: "apixaban",
    name: "Apixaban",
    aliases: ["apixaban", "eliquis"],
    drugClass: "Anticoagulant (DOAC)",
    clashes: [
      {
        id: "apixaban-anticoagulants",
        severity: "contraindicated",
        title: "Other anticoagulants",
        examples: ["Rivaroxaban", "edoxaban", "dabigatran", "warfarin", "phenprocoumon", "heparin", "enoxaparin"],
        match: ["rivaroxaban", "edoxaban", "dabigatran", "warfarin", "phenprocoumon", "marcumar", "heparin", "enoxaparin", "clexane"],
        reason: "Combining anticoagulants multiplies bleeding risk. A short overlap is only for a supervised switch.",
      },
      {
        id: "apixaban-cyp",
        severity: "avoid",
        title: "Strong CYP3A4 and P-gp inhibitors",
        examples: ["Ketoconazole", "itraconazole", "voriconazole", "posaconazole", "ritonavir", "cobicistat"],
        match: ["ketoconazol", "itraconazol", "voriconazol", "posaconazol", "ritonavir", "cobicistat"],
        reason: "These raise apixaban levels and the risk of serious bleeding. Do not start them with apixaban.",
      },
      {
        id: "apixaban-inducers",
        severity: "avoid",
        title: "Strong CYP3A4 and P-gp inducers",
        examples: ["Rifampicin", "carbamazepine", "phenytoin", "phenobarbital", "St John’s wort"],
        match: ["rifampicin", "carbamazepin", "phenytoin", "phenobarbital", "johanniskraut"],
        reason: "These lower apixaban levels, so the anticoagulant may stop protecting against clots.",
      },
      {
        id: "apixaban-antiplatelet",
        severity: "avoid",
        title: "Antiplatelet drugs",
        examples: ["Aspirin (ASS)", "clopidogrel", "ticagrelor", "prasugrel"],
        match: ["clopidogrel", "ticagrelor", "prasugrel", "ass", "aspirin", "acetylsalicyl"],
        reason: "Added bleeding risk. Use only when a specialist has a clear reason for both.",
      },
      {
        id: "apixaban-nsaid",
        severity: "avoid",
        title: "NSAIDs",
        examples: ["Ibuprofen", "diclofenac", "naproxen", "celecoxib"],
        match: ["ibuprofen", "diclofenac", "naproxen", "celecoxib"],
        reason: "NSAIDs add gastrointestinal and other bleeding risk on top of apixaban.",
      },
    ],
  },
  {
    id: "ramipril",
    name: "Ramipril",
    aliases: ["ramipril"],
    drugClass: "ACE inhibitor",
    clashes: [
      {
        id: "ramipril-arni",
        severity: "contraindicated",
        title: "Sacubitril / valsartan",
        examples: ["Sacubitril/valsartan (Entresto)"],
        match: ["sacubitril", "entresto"],
        reason: "The combination can cause angioedema. Do not overlap; leave a washout after the last ramipril dose.",
      },
      {
        id: "ramipril-aliskiren",
        severity: "contraindicated",
        title: "Aliskiren",
        examples: ["Aliskiren"],
        match: ["aliskiren"],
        reason: "Dual renin–angiotensin blockade, especially in diabetes, risks low blood pressure, high potassium and kidney injury.",
      },
      {
        id: "ramipril-raas",
        severity: "avoid",
        title: "Another ACE inhibitor or an ARB",
        examples: ["Enalapril", "lisinopril", "candesartan", "losartan", "valsartan"],
        match: ["enalapril", "lisinopril", "perindopril", "candesartan", "losartan", "valsartan", "irbesartan"],
        reason: "Do not stack two drugs that block the same system.",
      },
      {
        id: "ramipril-lithium",
        severity: "avoid",
        title: "Lithium",
        examples: ["Lithium"],
        match: ["lithium"],
        reason: "Ramipril can raise lithium levels into the toxic range.",
      },
      {
        id: "ramipril-nsaid",
        severity: "avoid",
        title: "NSAIDs",
        examples: ["Ibuprofen", "diclofenac", "naproxen"],
        match: ["ibuprofen", "diclofenac", "naproxen"],
        reason: "With an ACE inhibitor, NSAIDs can worsen kidney function and blunt blood-pressure control.",
      },
    ],
  },
  {
    id: "levothyroxine",
    name: "Levothyroxine",
    aliases: ["l-thyroxin", "l-thyrox", "thyroxin", "levothyroxin", "euthyrox"],
    drugClass: "Thyroid hormone",
    clashes: [
      {
        id: "levothyroxine-binders",
        severity: "separate",
        title: "Calcium, iron and some antacids",
        examples: ["Calcium carbonate", "ferrous sulfate", "aluminium or magnesium antacids", "cholestyramine"],
        match: ["calcium", "kalzium", "eisen", "ferrous", "cholestyramin"],
        reason: "These bind levothyroxine in the gut. Do not take them at the same time; separate by at least 4 hours.",
      },
    ],
  },
];

function refFor(doc: SourceDoc, idx: number, text: string): Ref {
  return { segId: `${doc.id}#${idx}`, docId: doc.id, docTitle: doc.title, docTitleEn: doc.titleEn, date: doc.date, text };
}

function matchDrug(text: string): DrugDef | undefined {
  const n = text.toLowerCase();
  return [...DRUGS].sort((a, b) => Math.max(...b.aliases.map((x) => x.length)) - Math.max(...a.aliases.map((x) => x.length)))
    .find((d) => d.aliases.some((a) => n.includes(a)));
}

/** Latest medication line in the chart, split into one row per medicine. */
export function currentMedications(docs: SourceDoc[] = DOCUMENTS): CurrentMed[] {
  const hits = docs.flatMap((d) =>
    d.lines.map((text, idx) => ({ d, text, idx })).filter((x) => /medikation/i.test(x.text)),
  );
  const aktuelle = hits.filter((h) => /aktuelle medikation/i.test(h.text));
  const pool = (aktuelle.length ? aktuelle : hits).sort((a, b) => b.d.date.localeCompare(a.d.date));
  const best = pool[0];
  if (!best) return [];
  const body = best.text.replace(/^.*?medikation:\s*/i, "").replace(/\.\s*$/, "");
  return body
    .split(/,(?!\d)/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((detail) => {
      const drug = matchDrug(detail);
      const schedule = detail.match(/\d\s*-\s*\d\s*-\s*\d(?:\s*-\s*\d)?/)?.[0]?.replace(/\s/g, "") ?? (/\bbei bedarf\b/i.test(detail) ? "as needed" : "");
      const dose = detail.match(/\d+(?:[.,]\d+)?\s*(?:µg|μg|mg|g|ml|mcg)/i)?.[0] ?? "";
      return {
        id: drug?.id ?? detail.toLowerCase(),
        name: drug?.name ?? detail,
        drugClass: drug?.drugClass ?? "",
        dose,
        schedule,
        detail,
        ref: refFor(best.d, best.idx, best.text),
        clashes: drug?.clashes ?? [],
      };
    });
}

/** A current medicine that appears on another current medicine's clash list. */
export function clashesInside(meds: CurrentMed[]): InListClash[] {
  const out: InListClash[] = [];
  for (const med of meds) {
    for (const rule of med.clashes) {
      for (const other of meds) {
        if (other.id === med.id) continue;
        const blob = `${other.name} ${other.detail}`.toLowerCase();
        if (!rule.match.some((m) => blob.includes(m))) continue;
        const id = [med.id, other.id, rule.id].sort().join(":");
        if (out.some((x) => x.id === id)) continue;
        out.push({ id, taken: med.name, other: other.name, severity: rule.severity, reason: rule.reason });
      }
    }
  }
  return out;
}

function line(pred: (text: string) => boolean, docs: SourceDoc[] = DOCUMENTS) {
  const hits = docs.flatMap((d) => d.lines.map((text, idx) => ({ d, text, idx })).filter((x) => pred(x.text)));
  return hits.sort((a, b) => b.d.date.localeCompare(a.d.date))[0];
}

/** Standing safety items read directly from the documents. */
export function chartRisks(docs: SourceDoc[] = DOCUMENTS): ChartRisk[] {
  const risks: ChartRisk[] = [];
  const allergy = docs
    .flatMap((d) => d.lines.map((text, idx) => ({ d, text, idx })))
    .filter((x) => /penicillin/i.test(x.text) && !/keine bekannten/i.test(x.text))
    .sort((a, b) => (/exanthem/i.test(b.text) ? 1 : 0) - (/exanthem/i.test(a.text) ? 1 : 0) || b.d.date.localeCompare(a.d.date))[0];
  if (allergy) {
    risks.push({
      id: "penicillin",
      title: "Drug allergy",
      detail: "Penicillin — rash (exanthem). An earlier admission note recorded no known allergies.",
      ref: refFor(allergy.d, allergy.idx, allergy.text),
    });
  }
  const thinner = line((t) => /apixaban/i.test(t), docs);
  if (thinner) {
    risks.push({
      id: "bleeding",
      title: "Bleeding risk",
      detail: "Apixaban 5 mg 1-0-1 after a deep-vein thrombosis in January 2016. A pre-operative note from 2015 said she was not anticoagulated.",
      ref: refFor(thinner.d, thinner.idx, thinner.text),
    });
  }
  const ponv = line((t) => /ponv|übelkeit/i.test(t), docs);
  if (ponv) {
    risks.push({
      id: "ponv",
      title: "Previous anaesthesia",
      detail: "Severe nausea and vomiting after cholecystectomy under general anaesthesia in 2008.",
      ref: refFor(ponv.d, ponv.idx, ponv.text),
    });
  }
  return risks;
}

export function chartDocuments(docs: SourceDoc[] = DOCUMENTS) {
  return [...docs].sort((a, b) => a.date.localeCompare(b.date));
}

export function clashLabel(severity: ClashSeverity) {
  if (severity === "contraindicated") return "Do not combine";
  if (severity === "separate") return "Separate the doses";
  return "Avoid";
}
