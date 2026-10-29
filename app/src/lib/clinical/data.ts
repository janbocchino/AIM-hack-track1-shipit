// PLACEHOLDER synthetic patient modelled on the Track 1 brief ("Anna Musterfrau",
// German documents 2015–2016). Replace with the real data/patient-0000-0001 files
// via the same shape: each document is a list of lines; each line becomes one
// citable segment with id `${docId}#${lineIndex}`.

export type SourceDoc = {
  id: string;
  title: string;
  titleEn: string;
  date: string; // ISO
  author: string;
  lines: string[];
};

export type Patient = {
  id: string;
  name: string;
  aliases: string[];
};

export const PATIENT: Patient = {
  id: "0000-0001",
  name: "Anna Musterfrau",
  aliases: ["anna", "musterfrau", "frau musterfrau", "0000-0001"],
};

export const DOCUMENTS: SourceDoc[] = [
  {
    id: "D1",
    title: "Aufnahmebefund Gynäkologie",
    titleEn: "Gynaecology admission note",
    date: "2015-02-20",
    author: "Frauenklinik, Dr. Weber",
    lines: [
      "Patientin: Anna Musterfrau, geb. 14.05.1962",
      "Vorstellungsgrund: Tastbarer Knoten in der linken Brust seit ca. 4 Wochen.",
      "Anamnese: Arterielle Hypertonie seit 2010, Hypothyreose seit 2012.",
      "Voroperationen: Laparoskopische Cholezystektomie 2008 in Vollnarkose.",
      "Allergien: Keine bekannten Allergien.",
      "Medikation: Ramipril 5 mg 1-0-0, L-Thyroxin 75 µg 1-0-0.",
      "Nikotin: Nichtraucherin. Alkohol: gelegentlich.",
      "Befund: Mamma links oberer äußerer Quadrant derber Knoten ca. 1,8 cm, axillär kein palpabler Lymphknoten.",
      "Mammasonographie: Suspekte Raumforderung links 1,7 x 1,5 cm, BI-RADS 5.",
      "Größe 168 cm | Gewicht 72 kg",
      "Procedere: Stanzbiopsie links, Staging-Untersuchungen.",
    ],
  },
  {
    id: "D2",
    title: "Histologischer Befund Stanzbiopsie",
    titleEn: "Pathology report, core biopsy",
    date: "2015-02-24",
    author: "Institut für Pathologie, Prof. Klein",
    lines: [
      "Einsendung: Stanzbiopsie Mamma rechts, 3 Zylinder.",
      "Diagnose: Invasives Karzinom ohne speziellen Typ (NST), G2.",
      "Östrogenrezeptor: positiv, 90 % der Tumorzellkerne.",
      "Progesteronrezeptor: positiv, 60 % der Tumorzellkerne.",
      "HER2/neu: negativ (Score 1+).",
      "Ki-67: 15 %.",
      "Kommentar: Befund passend zu Luminal-A-artigem Mammakarzinom.",
    ],
  },
  {
    id: "D3",
    title: "Protokoll Interdisziplinäre Tumorkonferenz",
    titleEn: "Multidisciplinary tumour board",
    date: "2015-03-02",
    author: "Brustzentrum",
    lines: [
      "Patientin: Anna Musterfrau, geb. 15.04.1962",
      "Diagnose: Mammakarzinom links, cT1c cN0 M0, NST G2.",
      "Rezeptorstatus: Hormonrezeptor-negativ, HER2 negativ.",
      "Staging: Röntgen-Thorax und Lebersonographie ohne Hinweis auf Metastasen.",
      "Empfehlung: Brusterhaltende Therapie links mit Sentinel-Lymphknotenbiopsie.",
      "Danach adjuvante Strahlentherapie und endokrine Therapie empfohlen.",
    ],
  },
  {
    id: "D4",
    title: "Anästhesiologische Prämedikation",
    titleEn: "Pre-anaesthetic assessment",
    date: "2015-03-10",
    author: "Klinik für Anästhesiologie, Dr. Brandt",
    lines: [
      "Geplanter Eingriff: Brusterhaltende Operation links mit Sentinel-Lymphknotenbiopsie am 12.03.2015.",
      "Größe 168 cm | Gewicht 72 kg | BMI 30,1 kg/m²",
      "Allergien: Penicillin (Exanthem).",
      "Vornarkosen: Cholezystektomie 2008, damals ausgeprägte postoperative Übelkeit und Erbrechen (PONV).",
      "Atemweg: Mallampati II, Mundöffnung > 3 cm, Zähne saniert.",
      "Kardiopulmonal: Belastbarkeit > 4 MET, keine Angina pectoris, keine Dyspnoe.",
      "EKG: Sinusrhythmus, 72/min, Linkstyp, keine Erregungsrückbildungsstörungen.",
      "Labor: Hb 13,4 g/dl | Kreatinin 0,8 mg/dl | Kalium 4,1 mmol/l | Quick 98 %",
      "Antikoagulation: keine.",
      "ASA-Klassifikation: II.",
      "Empfehlung: PONV-Prophylaxe, Fortführung Ramipril bis Vortag.",
    ],
  },
  {
    id: "D5",
    title: "Operationsbericht",
    titleEn: "Operative report",
    date: "2015-03-12",
    author: "Frauenklinik, Dr. Weber",
    lines: [
      "Datum der Operation: 12.03.2015",
      "Eingriff: Brusterhaltende Tumorexstirpation Mamma links und Sentinel-Lymphknotenbiopsie links axillär.",
      "Narkose: Intubationsnarkose, komplikationslos.",
      "Intraoperativ: Tumor im oberen äußeren Quadranten links, makroskopisch im Gesunden entfernt.",
      "Sentinel-Lymphknoten: 2 Lymphknoten entnommen.",
      "Blutverlust: gering. Keine Komplikationen.",
    ],
  },
  {
    id: "D6",
    title: "Entlassungsbrief",
    titleEn: "Discharge letter",
    date: "2015-03-18",
    author: "Frauenklinik",
    lines: [
      "Wir berichten über Frau Anna Musterfrau, stationär vom 11.03.2015 bis 18.03.2015.",
      "Diagnose: Invasives Mammakarzinom links, pT1c (1,6 cm) pN0 (0/2 sn) M0, G2, R0.",
      "Durchgeführte Operation am 14.03.2015: Brusterhaltende Therapie links mit Sentinel-Lymphknotenbiopsie.",
      "Postoperativer Verlauf: komplikationslos, Wundheilung regelrecht.",
      "Histologie des Resektats: Östrogenrezeptor positiv (90 %), Progesteronrezeptor positiv (60 %), HER2 negativ.",
      "Medikation bei Entlassung: Ramipril 5 mg 1-0-0, L-Thyroxin 75 µg 1-0-0, Metamizol 500 mg bei Bedarf.",
      "Allergien: Penicillin.",
      "Weiteres Procedere: Vorstellung Strahlentherapie, anschließend endokrine Therapie.",
    ],
  },
  {
    id: "D7",
    title: "Arztbrief Strahlentherapie und Echokardiographie",
    titleEn: "Radiotherapy letter and echocardiography",
    date: "2015-08-21",
    author: "Klinik für Strahlentherapie",
    lines: [
      "Strahlentherapie der linken Brust vom 13.04.2015 bis 22.05.2015 abgeschlossen, Gesamtdosis 50,4 Gy, Boost 16 Gy.",
      "Akute Nebenwirkungen: Radiodermatitis Grad 1, rückläufig.",
      "Echokardiographie vom 20.08.2015: LVEF 62 %, keine regionalen Wandbewegungsstörungen, keine relevanten Klappenvitien.",
      "Beginn endokrine Therapie mit Letrozol 2,5 mg 1-0-0 ab 01.09.2015 empfohlen.",
      "Größe 168 cm | Gewicht 70 kg",
    ],
  },
  {
    id: "D8",
    title: "Nachsorgebericht Onkologie",
    titleEn: "Oncology follow-up report",
    date: "2016-04-12",
    author: "Onkologische Ambulanz, Dr. Hofmann",
    lines: [
      "Nachsorge bei Mammakarzinom links, Z.n. BET und Radiatio 2015, unter Letrozol seit 09/2015.",
      "Zwischenzeitlich: Tiefe Beinvenenthrombose rechts im Januar 2016, seitdem Antikoagulation mit Apixaban 5 mg 1-0-1.",
      "Aktuelle Medikation: Letrozol 2,5 mg 1-0-0, Apixaban 5 mg 1-0-1, Ramipril 5 mg 1-0-0, L-Thyroxin 75 µg 1-0-0.",
      "Größe 168 cm | Gewicht 68 kg",
      "Labor: Hb 12,9 g/dl | Kreatinin 0,8 mg/dl | eGFR > 90 ml/min | TSH 1,8 mU/l",
      "Klinisch und sonographisch kein Hinweis auf Rezidiv.",
      "Arthralgien unter Letrozol, gut tolerabel.",
      "Geplant: Mammographie in 6 Monaten. Patientin wünscht Korrektur-OP der Narbe links, Vorstellung Plastische Chirurgie.",
    ],
  },
];

export function getDoc(id: string) {
  return DOCUMENTS.find((d) => d.id === id);
}
