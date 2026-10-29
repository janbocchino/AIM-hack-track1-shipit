// Hardcoded clinical domain knowledge: which fact types a role/task needs,
// which are critical, synonyms (DE/EN) for domain-aware retrieval, drug classes.

export type FactSpec = {
  key: string;
  label: string;
  critical: boolean;
  hint: string; // what counts as this fact
  terms: string[]; // retrieval terms (German + English)
};

export const FACTS: Record<string, FactSpec> = {
  age: { key: "age", label: "Age / date of birth", critical: false, hint: "Date of birth; age may be calculated from it.", terms: ["geb.", "geboren", "alter", "age"] },
  anticoagulation: { key: "anticoagulation", label: "Blood thinners", critical: true, hint: "Current anticoagulants / antiplatelets with dose (apixaban, rivaroxaban, heparin, ASS, clopidogrel, phenprocoumon...). Use the most recent document.", terms: ["antikoag", "apixaban", "eliquis", "rivaroxaban", "xarelto", "heparin", "marcumar", "phenprocoumon", "ass", "clopidogrel", "thrombose", "quick", "inr"] },
  allergies: { key: "allergies", label: "Allergies", critical: true, hint: "Drug or other allergies and reaction.", terms: ["allergi", "unverträglich", "exanthem", "penicillin"] },
  cardiac: { key: "cardiac", label: "Heart function", critical: true, hint: "LVEF, echo, ECG, exercise tolerance, cardiac disease.", terms: ["lvef", "echo", "ekg", "kardi", "herz", "met", "angina", "dyspnoe"] },
  renal: { key: "renal", label: "Kidney function", critical: false, hint: "Creatinine, eGFR.", terms: ["kreatinin", "egfr", "niere"] },
  hemoglobin: { key: "hemoglobin", label: "Haemoglobin", critical: false, hint: "Most recent Hb.", terms: ["hb ", "hämoglobin", "hb"] },
  airway: { key: "airway", label: "Airway", critical: false, hint: "Mallampati, mouth opening, dentition, difficult airway.", terms: ["mallampati", "atemweg", "mundöffnung", "intubation"] },
  priorAnaesthesia: { key: "priorAnaesthesia", label: "Previous anaesthesia", critical: false, hint: "Previous anaesthetics and complications (PONV, malignant hyperthermia...).", terms: ["narkose", "ponv", "übelkeit", "vornarkose", "cholezystektomie"] },
  weight: { key: "weight", label: "Height / weight / BMI", critical: false, hint: "Latest height, weight, BMI; weight change over time may be calculated.", terms: ["größe", "gewicht", "bmi", "kg"] },
  asa: { key: "asa", label: "ASA class", critical: false, hint: "ASA physical status.", terms: ["asa"] },
  comorbidities: { key: "comorbidities", label: "Comorbidities", critical: false, hint: "Chronic diseases (hypertension, thyroid, diabetes, thrombosis...).", terms: ["hypertonie", "hypothyreose", "diabetes", "anamnese", "thrombose"] },
  medication: { key: "medication", label: "Current medication", critical: true, hint: "Complete current medication list from the most recent document.", terms: ["medikation", "mg", "µg", "1-0-0"] },
  diagnosis: { key: "diagnosis", label: "Cancer diagnosis & stage", critical: false, hint: "Tumour type, side, TNM, grade, resection status.", terms: ["diagnose", "karzinom", "pt", "ct", "tnm", "g2", "r0", "nst"] },
  receptors: { key: "receptors", label: "Receptor status", critical: true, hint: "ER, PR, HER2, Ki-67.", terms: ["rezeptor", "her2", "ki-67", "östrogen", "progesteron"] },
  surgery: { key: "surgery", label: "Previous breast surgery (side, date)", critical: true, hint: "Breast operation: procedure, side, date.", terms: ["operation", "bet", "brusterhaltend", "sentinel", "eingriff", "tumorexstirpation"] },
  radiotherapy: { key: "radiotherapy", label: "Radiotherapy", critical: false, hint: "Radiation: site, dose, dates.", terms: ["strahlen", "radiatio", "gy", "boost", "radiodermatitis"] },
  endocrine: { key: "endocrine", label: "Endocrine / systemic therapy", critical: false, hint: "Letrozole, tamoxifen, chemotherapy, start dates, side effects.", terms: ["letrozol", "tamoxifen", "endokrin", "chemo", "arthralgie"] },
  recurrence: { key: "recurrence", label: "Recurrence status", critical: false, hint: "Latest follow-up result.", terms: ["rezidiv", "nachsorge", "metasta"] },
  thyroid: { key: "thyroid", label: "Thyroid", critical: false, hint: "Thyroid disease, levothyroxine, TSH.", terms: ["thyrox", "tsh", "hypothyreose", "schilddrüse"] },
  bloodPressure: { key: "bloodPressure", label: "Blood pressure", critical: false, hint: "Hypertension and its treatment.", terms: ["hypertonie", "ramipril", "blutdruck", "rr"] },
  bloodGroup: { key: "bloodGroup", label: "Blood group", critical: true, hint: "ABO/Rh blood group.", terms: ["blutgruppe", "rh", "abo"] },
  smoking: { key: "smoking", label: "Smoking", critical: false, hint: "Nicotine use.", terms: ["nikotin", "raucher"] },
};

export type TaskProfile = {
  id: string;
  name: string;
  match: string[]; // keywords in role/task text
  facts: string[];
  exclude: string[]; // explicitly irrelevant to this task
  title?: string; // clear screen title
  showTimeline?: boolean;
  conclude?: boolean; // add a verified conclusion box
};

// Hardcoded role x task profiles (allowed by the brief).
export const PROFILES: TaskProfile[] = [
  { id: "anaesthesia-preop", name: "Anaesthesia · pre-operative check", title: "Pre-operative anaesthesia check", conclude: true, match: ["anaesth", "anesth", "anästh", "narkose", "pre-op", "preop", "prämedikation"], facts: ["age", "weight", "anticoagulation", "allergies", "cardiac", "renal", "hemoglobin", "airway", "priorAnaesthesia", "asa", "comorbidities", "medication"], exclude: ["receptors", "endocrine", "radiotherapy", "recurrence"] },
  { id: "oncology-followup", name: "Oncology · follow-up", title: "Oncology follow-up", showTimeline: true, match: ["oncolog", "onkolog", "tumour board", "tumor board", "follow-up", "nachsorge"], facts: ["diagnosis", "receptors", "surgery", "radiotherapy", "endocrine", "recurrence", "cardiac", "medication"], exclude: ["airway", "priorAnaesthesia", "asa"] },
  { id: "surgery-planning", name: "Surgery · operation planning", title: "Operation planning", showTimeline: true, conclude: true, match: ["surgeon", "surgery", "chirurg", "plastic", "reconstruction", "scar", "narbe", "operation"], facts: ["surgery", "diagnosis", "radiotherapy", "anticoagulation", "allergies", "weight", "comorbidities", "smoking"], exclude: ["receptors", "thyroid"] },
  { id: "gp-review", name: "General practice · review", title: "GP medication & chronic care review", match: ["gp", "general practi", "hausarzt", "family doctor", "primary care"], facts: ["medication", "weight", "bloodPressure", "thyroid", "anticoagulation", "comorbidities", "renal", "endocrine"], exclude: ["airway", "asa"] },
  { id: "emergency", name: "Emergency · acute care", title: "Emergency assessment", conclude: true, match: ["emergency", "notfall", "notarzt", "bleeding", "blutung", "trauma", "er "], facts: ["anticoagulation", "allergies", "renal", "hemoglobin", "bloodGroup", "comorbidities", "medication", "cardiac"], exclude: ["receptors", "radiotherapy", "airway"] },
  { id: "nursing", name: "Nursing · handover", title: "Nursing handover", match: ["nurse", "nursing", "pflege", "handover", "übergabe"], facts: ["allergies", "medication", "anticoagulation", "comorbidities", "weight"], exclude: ["receptors"] },
];

export const GENERIC_PROFILE: TaskProfile = { id: "generic", name: "General overview", title: "Patient overview", showTimeline: true, match: [], facts: ["age", "diagnosis", "allergies", "medication", "anticoagulation", "comorbidities"], exclude: [] };

export function matchProfile(text: string): TaskProfile {
  const t = ` ${text.toLowerCase()} `;
  let best: TaskProfile | null = null;
  let bestScore = 0;
  for (const p of PROFILES) {
    const score = p.match.filter((m) => t.includes(m)).length;
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return best ?? GENERIC_PROFILE;
}

// Drug classes (domain knowledge for the relevance critic and prompts).
export const DRUG_CLASSES: Record<string, string> = {
  apixaban: "anticoagulant (DOAC)", rivaroxaban: "anticoagulant (DOAC)", edoxaban: "anticoagulant (DOAC)", dabigatran: "anticoagulant (DOAC)",
  phenprocoumon: "anticoagulant (VKA)", heparin: "anticoagulant", enoxaparin: "anticoagulant (LMWH)", ass: "antiplatelet", clopidogrel: "antiplatelet",
  letrozol: "aromatase inhibitor (letrozole)", tamoxifen: "SERM", ramipril: "ACE inhibitor", "l-thyroxin": "levothyroxine", metamizol: "metamizole (analgesic)",
};

/** Display groups: keeps each screen short and scannable. */
export const GROUPS: { name: string; keys: string[] }[] = [
  { name: "Risks", keys: ["anticoagulation", "allergies", "cardiac", "priorAnaesthesia", "airway", "asa", "bloodGroup", "smoking"] },
  { name: "Body & labs", keys: ["age", "weight", "renal", "hemoglobin", "thyroid", "bloodPressure"] },
  { name: "Cancer history", keys: ["diagnosis", "receptors", "surgery", "radiotherapy", "endocrine", "recurrence"] },
  { name: "Background", keys: ["comorbidities", "medication"] },
];

/** Why a critical fact matters (shown when the clinician expands it). */
export const WHY_CRITICAL: Record<string, string> = {
  anticoagulation: "Determines bleeding risk, timing of surgery/neuraxial procedures and reversal in emergencies.",
  allergies: "Wrong drug choice can cause anaphylaxis; perioperative antibiotics depend on it.",
  cardiac: "Defines anaesthetic risk and haemodynamic monitoring needs.",
  medication: "Drives interactions, pausing decisions and continuation on the ward.",
  receptors: "Determines endocrine and targeted therapy options.",
  surgery: "Side and date are needed for planning, consent and site marking.",
  bloodGroup: "Needed for transfusion in acute bleeding.",
};
