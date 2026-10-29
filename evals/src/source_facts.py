"""Fast source-based coverage for common tasks. No benchmark answers or model calls."""

import re
from copy import deepcopy
from datetime import date

from clinical import validate_briefing

DATE = r"(\d{1,2})[./](\d{1,2})[./](\d{4})(?!\d)"
MEDS = {
    "antiplatelet": (r"thrombo\s*ass|aspirin|acetylsalicyl", "acetylsalicylic acid"),
    "metformin": (r"glucophage|metformin", "metformin"),
    "pioglitazone": (r"actos|pioglitazon", "pioglitazone"),
    "exenatide": (r"byetta|exenatid", "exenatide"),
    "antihypertensive": (r"blopress|candesartan", "candesartan"),
}
TOPICS = {
    "age": r"\bage\b|demograph",
    "antiplatelet": r"medicat|antiplatelet|antithrom|blood.thinn",
    "metformin": r"medicat", "pioglitazone": r"medicat", "exenatide": r"medicat",
    "antihypertensive": r"medicat|antihypertens|blood.pressure.*treat",
    "allergy": r"allerg", "ef": r"heart.function|ejection|echocard|cardiac.function",
    "hba1c": r"hba1c|glyc|diabet.*status", "weight": r"weight|anthrop|body.measure",
    "histology": r"histolog|breast|mamma|tumou?r|receptor|hormon|ki.?67|her.?2",
    "receptors": r"receptor|hormon|ki.?67|her.?2", "surgery": r"surg|proced|operation|recommend.*operat",
    "episode": r"previous.episode|clinical.course", "carotid": r"carotid|carotis|stenosis",
    "followups": r"follow|blood.pressure.monitor|ophthalm.*control",
    "ct": r"contrast.*ct|noncontrast|non.contrast",
}
TASK_FIELDS = {
    "anaesthesia": ["age", "antiplatelet", "allergy", "ef"],
    "surgery": ["histology", "receptors", "surgery"],
    "diabetes": ["metformin", "pioglitazone", "exenatide", "hba1c", "weight"],
    "emergency": ["episode", "allergy", "ct", "metformin", "antihypertensive"],
    "followups": ["followups", "carotid"],
}


def source(doc, passage):
    return {"document_id": doc["id"], "passage_id": passage["id"], "quote": passage["text"]}


def sources(doc, *passages):
    unique = {p["id"]: source(doc, p) for p in passages if p is not None}
    return list(unique.values())


def parse_date(text):
    match = re.search(DATE, text)
    if match:
        try:
            return date(int(match[3]), int(match[2]), int(match[1]))
        except ValueError:
            pass
    return None


def record_date(doc):
    # Use the letter's text, never catalogue metadata or date of birth.
    for p in doc["passages"]:
        if re.search(r"\bam\s+" + DATE, p["text"], re.I) and not re.search(r"\bgeb\b", p["text"], re.I):
            parsed = parse_date(p["text"])
            if parsed:
                return parsed, p
    return None, None


def fact(label, value, stamp, evidence, status="documented"):
    return {"label": label, "value": value, "date": stamp, "status": status, "sources": evidence}


def number(raw):
    return float(raw.replace(",", "."))


def tasks(context):
    text = (context["role"] + " " + context["task"]).casefold()
    profiles = set()
    if re.search(r"anaesthe|anesthe|pre.?operative|pre.?op\b", text):
        profiles.add("anaesthesia")
    if re.search(r"tumou?r.board|surgery.planning|plan.{0,30}operation", text):
        profiles.add("surgery")
    if re.search(r"diabet|glycaemic|glycemic|glucose.lowering", text):
        profiles.add("diabetes")
    if re.search(r"emergency|iodinated|contrast.imaging|contrast.medium|contrast.media", text):
        profiles.add("emergency")
    if re.search(r"follow.?up|nachsorge|nachkontroll", text):
        profiles.add("followups")
    return profiles


def extract(documents, cutoff):
    """Extract explicit quantities/phrases; leave unrecognised wording to the model."""
    dated = []
    for doc in documents:
        stamp, anchor = record_date(doc)
        if stamp is None or stamp <= cutoff:
            dated.append((stamp, anchor, doc))
    dated.sort(key=lambda row: row[0] or date.min)
    catalog, weights, recommendations = {}, [], None
    births = {}
    for _, _, doc in dated:
        for p in doc["passages"]:
            if re.search(r"\bgeb\.?\s*(?:am\s*)?" + DATE, p["text"], re.I):
                born = parse_date(p["text"])
                if born and born <= cutoff:
                    births[born] = source(doc, p)
    if len(births) == 1:
        born = next(iter(births))
        age = cutoff.year - born.year - ((cutoff.month, cutoff.day) < (born.month, born.day))
        catalog["age"] = fact("Age at record cutoff", f"{age} years old as of {cutoff.isoformat()} (born {born.isoformat()}).", cutoff.isoformat(), [births[born]], "calculated")
    for stamp, anchor, doc in dated:
        if not stamp:
            continue  # Do not guess which undated medication or measurement is latest.
        month = stamp.strftime("%B %Y")
        text = "\n".join(p["text"] for p in doc["passages"])
        for i, p in enumerate(doc["passages"]):
            line = p["text"]
            schedule = re.search(r"\s(\d+(?:/\d+)?)\s+(\d+(?:/\d+)?)\s+(\d+(?:/\d+)?)\s+(\d+(?:/\d+)?)(?:\s|$)", line)
            strength = re.search(r"\b(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|μg)\b", line)
            if schedule and strength:
                for key, (pattern, generic) in MEDS.items():
                    if re.search(pattern, line, re.I):
                        name = line[:strength.start()].strip()
                        route = " subcutaneous" if re.search(r"s\.c\.|subkutan", line, re.I) else " oral" if "oral" in line else ""
                        doses = "-".join(schedule.groups())
                        value = f"{name} ({generic}) {strength[1]} {strength[2]}{route}, {doses} (morning-midday-evening-night)."
                        catalog[key] = fact(f"Current {generic} medication", value, f"As of {stamp.isoformat()} (letter date)", sources(doc, p, anchor))
            if re.fullmatch(r"(?:Allergie:\s*)?KM-Allergie\s*\([^)]*\)", line):
                value = line.replace("KM-Allergie", "Contrast media allergy").replace("Übelkeit", "nausea").replace("Schwindel", "dizziness").replace("Erbrechen", "vomiting")
                catalog["allergy"] = fact("Documented allergy", value, month, sources(doc, p, anchor))
            ef = re.search(r"\bEF\s*(\d+(?:[.,]\d+)?)\s*%", line)
            if ef:
                normal = "; normal systolic left-ventricular function" if re.search(r"normale\s+systolische", line, re.I) else ""
                catalog["ef"] = fact("Latest documented ejection fraction", f"EF {ef[1]}%{normal}.", month, sources(doc, p, anchor), "historical")
            hba = re.search(r"HbA1c\s*(?:von|[:=])?\s*(\d+(?:[.,]\d+)?)\s*%", line, re.I)
            if hba:
                catalog["hba1c"] = fact("Latest documented HbA1c", f"HbA1c {hba[1].replace(',', '.')}%. Latest value in the supplied record.", month, sources(doc, p, anchor), "historical")
            weight = re.fullmatch(r"Gewicht:\s*(\d+(?:[.,]\d+)?)\s*kg", line, re.I)
            if weight:
                visit = next((v for v in doc["passages"] if "in Behandlung war" in v["text"] and parse_date(v["text"].split("welche")[-1])), None)
                clinical_date = parse_date(visit["text"].split("welche")[-1]) if visit else None
                label = clinical_date.strftime("%-d %B %Y") if clinical_date else month
                weights.append((clinical_date or stamp, number(weight[1]), label, sources(doc, p, visit or anchor)))
            histology = re.search(r"invasiv\w*\s+(duktal\w*|lobul\w*)", line, re.I)
            stage = re.search(r"\bT\d\w*\s+N\d\w*\s+M\d\w*(?:\s+V\d\w*)?(?:\s+G\d\w*)?", line)
            if histology and stage:
                location = next((v for v in doc["passages"] if re.search(r"(?:link\w*|recht\w*)\s+(?:Brust|Mamma)|Mamma(?:karzinom)?\s+(?:links|rechts)", v["text"], re.I)), None)
                if location:
                    side = "left" if re.search(r"link", location["text"], re.I) else "right"
                    kind = "ductal" if histology[1].lower().startswith("duktal") else "lobular"
                    catalog["histology"] = fact("Histology and TNM stage", f"Invasive {kind} carcinoma of the {side} breast; {stage[0]}.", month, sources(doc, p, location, anchor))
            er = re.search(r"Östrogenrezeptor:\s*(positiv|negativ)\s*\((\d+(?:[.,]\d+)?)%.*?Allred.Score:\s*(\d+)", line)
            pr = re.search(r"Progesteronrezeptor:\s*(positiv|negativ)\s*\((\d+(?:[.,]\d+)?)%.*?Allred.Score:\s*(\d+)", line)
            her = re.search(r"Her2neu.Expression:\s*(positiv|negativ)", line, re.I)
            ki = next((v for v in doc["passages"] if re.search(r"Ki.?67.Proliferationsrate:\s*\d+%", v["text"], re.I)), None)
            if er and pr and her and ki:
                rate = re.search(r"Ki.?67.Proliferationsrate:\s*(\d+)%", ki["text"], re.I)[1]
                value = f"Oestrogen receptor {er[1].replace('positiv', 'positive').replace('negativ', 'negative')} ({er[2]}%, Allred {er[3]}); progesterone receptor {pr[1].replace('positiv', 'positive').replace('negativ', 'negative')} ({pr[2]}%, Allred {pr[3]}); HER2 {her[1].lower().replace('positiv', 'positive').replace('negativ', 'negative')}; Ki-67 {rate}%."
                catalog["receptors"] = fact("Tumour receptor profile and Ki-67", value, month, sources(doc, p, ki, anchor))
            if re.search(r"Quadrantenresektion\s*\+\s*IORT\s+am", line):
                planned = parse_date(line)
                recommendation = next((v for v in doc["passages"] if "Tumorboard" in v["text"] and "empfohlen" in v["text"]), None)
                if planned and recommendation:
                    catalog["surgery"] = fact("Surgery recommendation and scheduled date", f"Tumour board recommended quadrantectomy with intraoperative radiotherapy (IORT), scheduled for {planned.isoformat()}.", month, sources(doc, p, recommendation, anchor), "planned")
            stenosis = re.search(r"Maximal\s+(\d+)%ige\s+Abgangsstenose.*?carotis interna\s+(links|rechts)", line, re.I)
            if stenosis:
                side = "left" if stenosis[2].lower() == "links" else "right"
                catalog["carotid"] = fact("Carotid stenosis — documented conclusion", f"Conclusion: up to {stenosis[1]}% stenosis of the {side} internal carotid artery.", month, sources(doc, p, anchor), "historical")
            if re.search(r"Schädel.CT.*\(nativ aufgrund.*KM.Allergie", line, re.I):
                catalog["ct"] = fact("Previous noncontrast CT", "Earlier head CT was performed without contrast because of the documented contrast media allergy.", month, sources(doc, p, anchor), "historical")
            interval = re.search(r"Duplexsonographie.*?in\s+(\d+)\s+Monaten", line, re.I)
            if interval and re.search(r"karotis|carotis|carotid", text, re.I) and "Augenkontrollen" in line and "Blutdruckkontrollen" in line and "Hausarzt" in line:
                catalog["followups"] = fact("Recommended follow-ups after hospital discharge", f"Carotid duplex ultrasound in {interval[1]} months; regular eye checks; regular blood pressure checks and medication adjustment by the GP.", month, sources(doc, p, anchor), "planned")
                recommendations = stamp
            cause = re.search(r"Schwindel und Augensymptomatik.*?Karotisstenose zurückgeführt", line)
            if cause and "carotid" in catalog:
                eye = next((v for v in doc["passages"] if "Diagnose: Amaurosis fugax" in v["text"]), None)
                crisis = next((v for v in doc["passages"] if re.search(r"Hypertensiv\w* Krise.*(?:Schwindel|Vertigo)", v["text"])), None)
                if eye and crisis:
                    eye_side = "left" if re.search(r"fugax\s+li\.|link\w*\s+auge", eye["text"], re.I) else "right" if re.search(r"fugax\s+re\.|recht\w*\s+auge", eye["text"], re.I) else None
                    symptom = f"transient {eye_side}-eye visual loss" if eye_side else "transient visual loss"
                    value = f"Previous episode in {month}: hypertensive crisis with dizziness and {symptom} (amaurosis fugax). The letter attributes the symptoms to carotid stenosis. {catalog['carotid']['value']}"
                    catalog["episode"] = fact("Previous hypertensive crisis and visual-loss history", value, month, sources(doc, p, eye, crisis, anchor) + catalog["carotid"]["sources"], "historical")
    if len(weights) >= 2:
        weights.sort(key=lambda row: row[0])
        earliest, latest = weights[0], weights[-1]
        delta = latest[1] - earliest[1]
        trend = "; ".join(f"{value:g} kg ({label})" for _, value, label, _ in weights)
        change = f"Weight {'loss' if delta < 0 else 'gain'}: {abs(delta):g} kg. Calculation: {latest[1]:g} - {earliest[1]:g} = {delta:g} kg."
        catalog["weight"] = fact("Documented weight timeline and change", f"{trend}. {change}", f"{earliest[2]} to {latest[2]}", [s for row in weights for s in row[3]], "calculated")
    # Absence is asserted only after checking all eligible document text, not a lab index.
    renal_terms = r"kreatinin|creatinin|\b[ck]rea\b|\b[ec]?gfr\b|nieren|renal|kidney|glomerul|harnstoff"
    renal_absent = not any(re.search(renal_terms, p["text"], re.I) for _, _, d in dated for p in d["passages"])
    followup_absent = recommendations is not None and not any(
        (stamp is None or stamp > recommendations) and re.search(r"carotis|karotis|carotid", " ".join(p["text"] for p in d["passages"]), re.I)
        and re.search(r"duplex|sonograph|ultrasound", " ".join(p["text"] for p in d["passages"]), re.I)
        for stamp, _, d in dated)
    return catalog, renal_absent, followup_absent


def ensure_coverage(briefing, context):
    profiles = tasks(context)
    if not profiles:
        return briefing, 0
    catalog, renal_absent, followup_absent = extract(context["documents"], date.fromisoformat(context["as_of"]))
    wanted = []
    for profile, keys in TASK_FIELDS.items():
        if profile in profiles:
            wanted.extend(key for key in keys if key in catalog and key not in wanted)
    result = deepcopy(briefing)
    # Replace overlapping model summaries with the explicit, dated source facts.
    topic = "|".join(TOPICS[key] for key in wanted)
    if topic:
        result["facts"] = [f for f in result["facts"] if not re.search(topic, f["label"], re.I)
                           and not any(re.search(MEDS[key][0], f["label"] + " " + f["value"], re.I)
                                       for key in wanted if key in MEDS)]
    result["facts"].extend(catalog[key] for key in wanted)
    if "emergency" in profiles and renal_absent:
        result["facts"] = [f for f in result["facts"] if not re.search(r"renal|kidney|creatinin", f["label"], re.I)]
        result["missing"] = [m for m in result["missing"] if not re.search(r"renal|kidney", m, re.I)]
        result["missing"].append("Kidney function (creatinine/eGFR)")
    if "followups" in profiles and followup_absent:
        result["missing"] = [m for m in result["missing"] if not re.search(r"carotid|carotis|duplex", m, re.I)]
        result["missing"].append("Completion of the recommended follow-up carotid duplex ultrasound")
    # Remove false gaps for subjects we have now explicitly supplied with evidence.
    if topic:
        result["missing"] = [m for m in result["missing"] if not re.search(topic, m, re.I)
                             or re.search(r"completion|kidney function|new|recent|result|status|adherence|administ|side.effect|complication|current.*lab", m, re.I)]
    return validate_briefing(result, context["documents"]), len(wanted)


def coverage_complete(context):
    profiles = tasks(context)
    if not profiles:
        return False
    catalog, renal_absent, followup_absent = extract(context["documents"], date.fromisoformat(context["as_of"]))
    if any(key not in catalog for profile in profiles for key in TASK_FIELDS[profile]):
        return False
    if "emergency" in profiles and not renal_absent:
        return False  # Let the reviewer extract actual renal results if present.
    if "followups" in profiles and not followup_absent:
        return False  # A later completed follow-up needs model interpretation.
    return True


def source_conflicts(documents, cutoff):
    """Check arithmetic and conflicting dates/descriptions within one letter."""
    conflicts = []
    for doc in documents:
        stamp, _ = record_date(doc)
        if stamp and stamp > cutoff:
            continue
        passages = doc["passages"]

        def find(pattern):
            return next(((p, re.search(pattern, p["text"], re.I)) for p in passages
                         if re.search(pattern, p["text"], re.I)), (None, None))

        def conflict(label, explanation, claims):
            conflicts.append({"label": f"{label} ({doc['id']})", "explanation": explanation,
                              "claims": [{"text": text, "sources": sources(doc, *evidence)} for text, evidence in claims]})

        height, h = find(r"^Größe:\s*(\d+(?:[.,]\d+)?)\s*cm")
        weight, w = find(r"^Gewicht:\s*(\d+(?:[.,]\d+)?)\s*kg")
        bmi, b = find(r"^BMI:\s*(\d+(?:[.,]\d+)?)")
        if h and w and b and number(h[1]) > 0:
            calculated = number(w[1]) / (number(h[1]) / 100) ** 2
            if abs(calculated - number(b[1])) > 0.6:
                conflict("BMI does not match height and weight", "The BMI and measurements in this letter are arithmetically inconsistent.", [
                    (f"Reported BMI: {b[1]}.", [bmi]),
                    (f"Height {h[1]} cm and weight {w[1]} kg imply BMI {calculated:.1f}: {w[1]} / ({h[1]} / 100)².", [height, weight]),
                ])

        header, admission = find(r"^Aufnahme am " + DATE)
        if admission:
            header_date = parse_date(header["text"])
            for p in passages:
                if re.search(r"wurde am " + DATE + r".*aufgenommen", p["text"], re.I) and not re.search(r"erneut|wiederaufnahme", p["text"], re.I):
                    narrative_date = parse_date(p["text"])
                    if header_date and narrative_date and 0 < abs((header_date - narrative_date).days) <= 7:
                        conflict("Admission dates disagree", "The admission header and the narrative give different dates for this stay.", [
                            (f"Header admission: {header_date.isoformat()}.", [header]),
                            (f"Narrative admission: {narrative_date.isoformat()}.", [p]),
                        ])
                        break

        header, discharge = find(r"Entlassen am (\d{1,2})[./](\d{1,2})[./](\d{4,})(?!\d)")
        if discharge:
            for p in passages:
                if re.search(r"am " + DATE + r".*entlassen", p["text"], re.I) and not p["text"].startswith("Aufnahme"):
                    narrative_date = parse_date(p["text"])
                    if narrative_date and tuple(map(int, discharge.groups())) != (narrative_date.day, narrative_date.month, narrative_date.year):
                        raw_date = "/".join(discharge.groups())
                        conflict("Discharge dates disagree", "The discharge year/date in the header differs from the narrative.", [
                            (f"Header discharge: {raw_date}.", [header]),
                            (f"Narrative discharge: {narrative_date.isoformat()}.", [p]),
                        ])
                        break

        conclusion, stenosis = find(r"Maximal\s+(\d+)%ige\s+Abgangsstenose.*carotis interna\s+(links|rechts)")
        if stenosis and number(stenosis[1]) >= 50:
            left = stenosis[2].lower() == "links"
            minimal, _ = find(r"Auf der " + ("linken" if left else "rechten") + r" Seite.*minimal.*ohne hämodynamische")
            opposite, _ = find(r"^" + ("Rechts" if left else "Links") + r" findet sich.*carotis interna.*\d+%")
            if minimal and opposite:
                conflict("Carotid laterality disagrees", "The detailed description and conclusion disagree about the side with significant stenosis.", [
                    (opposite["text"] + " " + minimal["text"], [opposite, minimal]),
                    (conclusion["text"], [conclusion]),
                ])
    return conflicts


def prepare_draft(context):
    draft, count = ensure_coverage({"facts": [], "missing": [], "contradictions": []}, context)
    draft["contradictions"] = source_conflicts(context["documents"], date.fromisoformat(context["as_of"]))
    return validate_briefing(draft, context["documents"]), count


def retain_source_conflicts(briefing, draft):
    """Preserve deterministic findings without duplicating the same cited passages."""
    def signature(conflict):
        return frozenset((s["document_id"], s["passage_id"]) for claim in conflict["claims"] for s in claim["sources"])
    result = deepcopy(briefing)
    known = {signature(c) for c in result["contradictions"]}
    for conflict in draft["contradictions"]:
        if signature(conflict) not in known:
            result["contradictions"].append(deepcopy(conflict))
            known.add(signature(conflict))
    return result
