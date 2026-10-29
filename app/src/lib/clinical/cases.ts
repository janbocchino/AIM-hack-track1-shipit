// PLACEHOLDER situations for the sample patient (replace with cases/situations.md + expected.json).
export type CaseQuestion = { q: string; factKey?: string; expectAny: string[]; notDocumented?: boolean };
export type Situation = { id: string; title: string; description: string; questions: CaseQuestion[] };

export const SITUATIONS: Situation[] = [
  {
    id: "s1",
    title: "Anaesthetist, pre-operative check",
    description: "Pre-anaesthetic assessment before scar correction surgery of the left breast.",
    questions: [
      { q: "Is she on blood thinners?", factKey: "anticoagulation", expectAny: ["apixaban"] },
      { q: "Any drug allergies?", factKey: "allergies", expectAny: ["penicillin"] },
      { q: "How is her heart function?", factKey: "cardiac", expectAny: ["62"] },
    ],
  },
  {
    id: "s2",
    title: "Oncologist, follow-up visit",
    description: "Routine oncology follow-up in spring 2016, reviewing tumour biology and current therapy.",
    questions: [
      { q: "Receptor status?", factKey: "receptors", expectAny: ["er", "estrogen", "oestrogen", "östrogen"] },
      { q: "Current endocrine therapy?", factKey: "endocrine", expectAny: ["letrozol"] },
      { q: "Tumour stage?", factKey: "diagnosis", expectAny: ["pt1c"] },
    ],
  },
  {
    id: "s3",
    title: "Plastic surgeon, operation planning",
    description: "Planning a scar correction of the breast after breast-conserving therapy.",
    questions: [
      { q: "Which side was operated?", factKey: "surgery", expectAny: ["left"] },
      { q: "Was the breast irradiated?", factKey: "radiotherapy", expectAny: ["50"] },
      { q: "Does she smoke?", factKey: "smoking", expectAny: ["non-smoker", "nonsmoker", "never", "no"] },
    ],
  },
  {
    id: "s4",
    title: "GP, medication review",
    description: "General practitioner reviewing chronic medication and weight after cancer treatment.",
    questions: [
      { q: "Thyroid medication?", factKey: "thyroid", expectAny: ["75"] },
      { q: "Blood pressure treatment?", factKey: "bloodPressure", expectAny: ["ramipril"] },
      { q: "Weight change?", factKey: "weight", expectAny: ["68"] },
    ],
  },
  {
    id: "s5",
    title: "Emergency physician, acute bleeding",
    description: "Patient arrives with a bleeding wound after a fall; need to decide on reversal and transfusion.",
    questions: [
      { q: "Anticoagulant?", factKey: "anticoagulation", expectAny: ["apixaban"] },
      { q: "Kidney function?", factKey: "renal", expectAny: ["0.8", "0,8", "90"] },
      { q: "Blood group?", factKey: "bloodGroup", expectAny: [], notDocumented: true },
    ],
  },
];
