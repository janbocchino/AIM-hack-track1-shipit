import { z } from "zod";
import { DOCUMENTS, PATIENT } from "./data";
import { FACTS, GENERIC_PROFILE, GROUPS, PROFILES, DRUG_CLASSES, matchProfile, type TaskProfile } from "./knowledge";
import { normalize, renderSegments, retrieve, segById, segments } from "./corpus";
import type { AgentRunner } from "./ai.server";
import type { ConclusionPoint, Contradiction, Fact, FactGroup, Lesson, PlanStep, Ref, TaskContext, TimelineEvent, TurnResult } from "./types";

// ---------- HARDCODED RULES (system-wide, not left to the model) ----------
const RULES = `Hard rules:
1. Use ONLY facts stated in the provided passages. Never use outside medical knowledge to add facts.
2. Every fact must cite passage ids [D#n] and quote the exact words (verbatim substring, original German).
3. If the passages do not contain the fact, return status "not_documented".
4. Translating to English, generic drug names and simple calculations (age, BMI, weight change) are allowed; mark calc.
5. Prefer the MOST RECENT document for current state (medication, weight, labs). Mention the date.
6. Never guess doses or diagnoses. Be terse: values, not sentences. Write values in English (keep drug names, doses and numbers exactly). Use ISO dates (YYYY-MM-DD).
8. Keep each value SHORT: at most 12 words, the clinically decisive value first (e.g. "Apixaban 5 mg twice daily (since Jan 2016)"). No sub-findings that are normal unless asked.
7. If sources disagree, give the most recent value and add "(conflicting: ...)".
Drug classes: ${Object.entries(DRUG_CLASSES).map(([k, v]) => `${k}=${v}`).join(", ")}.`;

const toRef = (id: string): Ref | null => {
  const s = segById(id.replace(/[[\]]/g, "").trim());
  return s ? { segId: s.segId, docId: s.docId, docTitle: s.docTitle, docTitleEn: s.docTitleEn, date: s.date, text: s.text } : null;
};

// ---------- Agent 1: Intent & context ----------
const ContextSchema = z.object({
  intent: z.enum(["task_screen", "question", "patient_summary", "history", "unclear"]),
  role: z.string(),
  task: z.string(),
  procedure: z.string().nullable(),
  question: z.string().nullable(),
  profileId: z.string(),
  extraFactKeys: z.array(z.string()),
  clarification: z.string().nullable(),
});

async function contextAgent(ai: AgentRunner, input: string, prior: TaskContext | null, history: string[]) {
  return ai.object({
    schema: ContextSchema,
    instructions: `You are the Intent & Context agent of a clinical task-screen system. Patient in the system: ${PATIENT.name} (id ${PATIENT.id}).
Decide what the clinician wants:
- task_screen: they state a role and/or task/situation (e.g. "anaesthetist, pre-op before breast surgery"), or add situational info ("she has an operation on Friday").
- question: a specific question about the patient ("is she on blood thinners?").
- patient_summary: only a patient name / "show patient".
- history: they ask for the patient history / course / timeline / "Verlauf".
- unclear: nothing usable.
Keep and update the prior context across turns (voice conversations arrive sentence by sentence). Roles may be implied.
profileId must be one of: ${PROFILES.map((p) => `${p.id} (${p.name})`).join("; ")}; generic.
extraFactKeys: fact keys needed beyond the profile because of the situation, from: ${Object.keys(FACTS).join(", ")}.`,
    prompt: `Prior context: ${prior ? JSON.stringify(prior) : "none"}
Recent conversation:\n${history.slice(-6).join("\n") || "(none)"}
New input: ${input}`,
  });
}

// ---------- Agent 2..n: Fact extractors (one per group, parallel) ----------
const ExtractSchema = z.object({
  facts: z.array(
    z.object({
      key: z.string(),
      status: z.enum(["found", "not_documented"]),
      value: z.string(),
      segIds: z.array(z.string()),
      quotes: z.array(z.string()),
      calc: z.string().nullable(),
    }),
  ),
  rejectedPassages: z.array(z.object({ segId: z.string(), reason: z.string() })),
});

function lessonsBlock(lessons: Lesson[], keys: string[]) {
  const rel = lessons.filter((l) => keys.includes(l.factKey)).slice(-12);
  if (!rel.length) return "";
  return (
    "\nLearned from clinician feedback (treat as test cases):\n" +
    rel
      .map((l) =>
        l.verdict === "rejected"
          ? `- REJECTED before: ${l.label} = "${l.value}"${l.note ? ` (${l.note})` : ""}. Do not repeat this mistake.`
          : l.verdict === "confirmed"
            ? `- CONFIRMED example: ${l.label} = "${l.value}".`
            : `- Clinician said "${l.label}" was missing${l.note ? `: ${l.note}` : ""}.`,
      )
      .join("\n")
  );
}

export async function extractorAgent(ai: AgentRunner, ctx: TaskContext, keys: string[], lessons: Lesson[]) {
  const specs = keys.map((k) => FACTS[k]).filter((x): x is NonNullable<typeof x> => !!x);
  let segs = retrieve(specs.flatMap((s) => s.terms));
  if (segs.length < 4) segs = segments();
  const out = await ai.object({
    schema: ExtractSchema,
    instructions: `You are a Fact Extractor agent with a built-in Relevance Critic.
${RULES}
Relevance critic: before using a passage, check it is about this patient, the right fact type, and the right time (current vs historical). List passages you discarded in rejectedPassages.`,
    prompt: `Clinician: ${ctx.role}. Task: ${ctx.task}${ctx.procedure ? `. Procedure: ${ctx.procedure}` : ""}.
Extract exactly these facts (one entry each, key as given):
${specs.map((s) => `- ${s.key}: ${s.label} — ${s.hint}`).join("\n")}
${lessonsBlock(lessons, keys)}
Passages:
${renderSegments(segs)}`,
  });
  return out;
}

// ---------- Verifier (enforced in code) ----------
const stripDates = (s: string) => s.replace(/\b\d{4}-\d{2}(-\d{2})?\b/g, " ").replace(/\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g, " ").replace(/\b\d{1,2}\/\d{4}\b/g, " ");
const numbersIn = (s: string) => (stripDates(s).match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));

function verifyFact(
  raw: z.infer<typeof ExtractSchema>["facts"][number],
  lessons: Lesson[],
): { fact: Fact | null; dropped: boolean } {
  const spec = FACTS[raw.key];
  if (!spec) return { fact: null, dropped: false };
  const base = { key: spec.key, label: spec.label, critical: spec.critical };
  if (raw.status === "not_documented" || !raw.segIds.length) {
    return { fact: { ...base, value: "Not documented", status: "not_documented", refs: [] }, dropped: false };
  }
  const refs = raw.segIds.map(toRef).filter((r): r is Ref => !!r);
  if (!refs.length) return { fact: { ...base, value: "Not documented", status: "not_documented", refs: [], note: "Source could not be verified" }, dropped: true };
  const corpus = normalize(refs.map((r) => r.text).join(" "));
  // every quote must be a verbatim substring of a cited passage
  const quotesOk = raw.quotes.length > 0 && raw.quotes.every((q) => corpus.includes(normalize(q)));
  // every number in the value must appear in the sources unless it is a declared calculation
  const srcNums = new Set(numbersIn(corpus));
  const numsOk = raw.calc ? true : numbersIn(raw.value).every((n) => srcNums.has(n) || corpus.includes(n));
  if (!quotesOk || !numsOk) {
    return { fact: { ...base, value: "Not documented", status: "not_documented", refs: [], note: "AI answer failed source verification and was removed" }, dropped: true };
  }
  const confirmedBefore = lessons.some((l) => l.factKey === raw.key && l.verdict === "confirmed" && normalize(l.value) === normalize(raw.value));
  return {
    fact: {
      ...base,
      value: raw.value,
      status: spec.critical && !confirmedBefore ? "needs_confirmation" : "verified",
      refs,
      note: raw.calc ? `Calculated: ${raw.calc}` : null,
    },
    dropped: false,
  };
}

// ---------- Contradiction agent (rules + AI, cached per patient) ----------
const ContraSchema = z.object({
  contradictions: z.array(z.object({ title: z.string(), explanation: z.string(), segIds: z.array(z.string()) })),
});

let contraCache: Promise<Contradiction[]> | null = null;

function ruleContradictions(): Contradiction[] {
  const out: Contradiction[] = [];
  // BMI vs height/weight on the same line
  for (const s of segments()) {
    const h = s.text.match(/Größe\s+(\d{3})\s*cm/i);
    const w = s.text.match(/Gewicht\s+(\d{2,3})\s*kg/i);
    const b = s.text.match(/BMI\s+(\d{2}(?:[.,]\d)?)/i);
    if (h && w && b) {
      const calc = Number(w[1]) / (Number(h[1]) / 100) ** 2;
      const doc = Number((b[1] ?? "").replace(",", "."));
      if (Math.abs(calc - doc) > 1) {
        const r = toRef(s.segId)!;
        out.push({ id: `bmi-${s.segId}`, title: "BMI does not match height and weight", explanation: `${h[1]} cm and ${w[1]} kg give a BMI of ${calc.toFixed(1)}, but the document states ${b[1]}.`, refs: [r] });
      }
    }
  }
  // Date of birth
  const dobs = segments()
    .map((s) => ({ s, m: s.text.match(/geb\.\s*(\d{2}\.\d{2}\.\d{4})/) }))
    .filter((x) => x.m);
  const distinct = new Set(dobs.map((x) => x.m![1]));
  if (distinct.size > 1) {
    out.push({ id: "dob", title: "Two different dates of birth", explanation: `Documents give ${[...distinct].join(" and ")}.`, refs: dobs.map((x) => toRef(x.s.segId)!) });
  }
  return out;
}

async function contradictionAgent(ai: AgentRunner): Promise<Contradiction[]> {
  const rules = ruleContradictions();
  const out = await ai.object({
    schema: ContraSchema,
    instructions: `You are the Contradiction agent. Find passages that CANNOT all be true (e.g. two dates for the same event, left vs right side, receptor positive vs negative, allergy vs no allergy).
NOT contradictions: values that changed over time (weight, labs, medication started later), small measurement differences, missing information.
Each contradiction must cite ALL conflicting passage ids. Skip BMI and date-of-birth checks (handled by rules). Be precise; false alarms are penalised. Write title and explanation in English. Cite at most 4 passages per contradiction (the most direct ones).`,
    prompt: renderSegments(segments()),
  });
  const ai_ = out.contradictions
    .map((c, i) => ({ id: `ai-${i}`, title: c.title, explanation: c.explanation, refs: c.segIds.map(toRef).filter((r): r is Ref => !!r) }))
    .filter((c) => new Set(c.refs.map((r) => r.segId)).size >= 2);
  return [...rules, ...ai_];
}

export function getContradictions(ai: AgentRunner) {
  if (!contraCache) {
    contraCache = contradictionAgent(ai).catch((e) => {
      contraCache = null;
      throw e;
    });
  }
  return contraCache;
}

// ---------- Timeline agent (cached per patient, dates verified in code) ----------
const TimelineSchema = z.object({
  events: z.array(z.object({ date: z.string(), label: z.string(), kind: z.string(), segId: z.string(), quote: z.string() })),
});
let timelineCache: Promise<TimelineEvent[]> | null = null;

function dateSupported(iso: string, quote: string, docDate: string) {
  const [y, m, d] = iso.split("-");
  if (!y) return false;
  const q = quote;
  if (d && m && q.includes(`${d}.${m}.${y}`)) return true;
  if (m && (q.includes(`${m}/${y}`) || q.includes(`${m}.${y}`))) return true;
  if (q.includes(y)) return true;
  return docDate.startsWith(iso.slice(0, 7)); // event dated by its document
}

async function timelineAgent(ai: AgentRunner): Promise<TimelineEvent[]> {
  const out = await ai.object({
    schema: TimelineSchema,
    instructions: `You are the Timeline agent. List the key clinical events in date order (8-12 events): diagnosis, biopsy, tumour board, admission, operation, radiotherapy, therapy start, complications (e.g. thrombosis), follow-ups.
Each event: ISO date (YYYY-MM-DD or YYYY-MM), English label of max 5 words, kind (diagnosis|procedure|therapy|complication|visit), the passage id and a verbatim quote containing the date if possible.
If two documents give different dates for the same event, list BOTH events with the same label.`,
    prompt: renderSegments(segments()),
  });
  const events: TimelineEvent[] = [];
  out.events.forEach((e, i) => {
    const ref = toRef(e.segId);
    if (!ref) return;
    if (!normalize(ref.text).includes(normalize(e.quote))) return;
    if (!dateSupported(e.date, ref.text, ref.date)) return;
    events.push({ id: `t${i}`, date: e.date, label: e.label, kind: e.kind, refs: [ref], conflict: false });
  });
  // same label with different dates = conflict
  const byLabel = new Map<string, TimelineEvent[]>();
  for (const e of events) byLabel.set(e.label.toLowerCase(), [...(byLabel.get(e.label.toLowerCase()) ?? []), e]);
  for (const list of byLabel.values()) if (new Set(list.map((x) => x.date)).size > 1) list.forEach((x) => (x.conflict = true));
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export function getTimeline(ai: AgentRunner) {
  if (!timelineCache) {
    timelineCache = timelineAgent(ai).catch((e) => {
      timelineCache = null;
      throw e;
    });
  }
  return timelineCache;
}

// ---------- Conclusion agent (bullets must cite verified on-screen facts) ----------
const ConclusionSchema = z.object({
  points: z.array(z.object({ text: z.string(), factKeys: z.array(z.string()), severity: z.enum(["high", "medium", "info"]) })),
});

export function verifyConclusion(points: ConclusionPoint[], facts: Fact[]): ConclusionPoint[] {
  const ok = new Set(facts.filter((f) => f.status !== "not_documented").map((f) => f.key));
  return points.filter((p) => p.factKeys.length > 0 && p.factKeys.every((k) => ok.has(k))).slice(0, 4);
}

async function conclusionAgent(ai: AgentRunner, ctx: TaskContext, facts: Fact[], contradictions: Contradiction[]) {
  const out = await ai.object({
    schema: ConclusionSchema,
    instructions: `You are the Conclusion agent. Write 2-4 short bullet points (max 14 words each) that a ${ctx.role} needs for: ${ctx.task}.
Use ONLY the facts given. Each bullet lists the fact keys it is based on. Start with the most safety-relevant. Flag conflicting documentation. Do not recommend drugs or doses that are not in the facts; generic clinical actions (e.g. "plan pause", "give PONV prophylaxis", "confirm with patient") are fine.`,
    prompt: `Facts:\n${facts.filter((f) => f.status !== "not_documented").map((f) => `${f.key}: ${f.value}${f.note ? ` (${f.note})` : ""}`).join("\n")}
Not documented: ${facts.filter((f) => f.status === "not_documented").map((f) => f.label).join(", ") || "none"}
Contradictions: ${contradictions.map((c) => c.title).join("; ") || "none"}`,
  });
  return verifyConclusion(out.points, facts);
}

function groupFacts(keys: string[]): FactGroup[] {
  const groups: FactGroup[] = [];
  const used = new Set<string>();
  for (const g of GROUPS) {
    const k = keys.filter((x) => g.keys.includes(x));
    if (k.length) { groups.push({ name: g.name, keys: k }); k.forEach((x) => used.add(x)); }
  }
  const rest = keys.filter((k) => !used.has(k));
  if (rest.length) groups.push({ name: "Other", keys: rest });
  return groups;
}

const notDoc = (k: string): Fact => ({ key: k, label: FACTS[k]?.label ?? k, critical: FACTS[k]?.critical ?? false, value: "Not documented", status: "not_documented", refs: [] });

async function extractFacts(ai: AgentRunner, ctx: TaskContext, keys: string[], lessons: Lesson[], t0: number, timings: Record<string, number>) {
  const chunks: string[][] = [];
  for (let i = 0; i < keys.length; i += 3) chunks.push(keys.slice(i, i + 3));
  const results = await Promise.all(
    chunks.map(async (g, i) => {
      const r = await extractorAgent(ai, ctx, g, lessons);
      timings[`extract-${i}`] = Date.now() - t0;
      return r;
    }),
  );
  let dropped = 0;
  const byKey = new Map<string, Fact>();
  for (const r of results)
    for (const f of r.facts) {
      const v = verifyFact(f, lessons);
      if (v.dropped) dropped++;
      if (v.fact && keys.includes(v.fact.key) && !byKey.has(v.fact.key)) byKey.set(v.fact.key, v.fact);
    }
  return { facts: keys.map((k) => byKey.get(k) ?? notDoc(k)), dropped, chunks };
}

function markConflicts(facts: Fact[], contradictions: Contradiction[], timeline: TimelineEvent[]) {
  const conflicted = new Set(contradictions.flatMap((x) => x.refs.map((r) => r.segId)));
  for (const f of facts) if (f.refs.some((r) => conflicted.has(r.segId))) f.note = [f.note, "Sources conflict — see contradictions"].filter(Boolean).join(" · ");
  for (const e of timeline) if (e.refs.some((r) => conflicted.has(r.segId))) e.conflict = true;
}

// ---------- Orchestrator ----------
export async function runTurn(
  ai: AgentRunner,
  input: { text: string; prior: TaskContext | null; history: string[]; lessons: Lesson[] },
): Promise<TurnResult> {
  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const contraP = getContradictions(ai).then((c) => { timings["contradictions"] = Date.now() - t0; return c; });
  contraP.catch(() => {});
  const timelineP = getTimeline(ai).then((t) => { timings["timeline"] = Date.now() - t0; return t; });
  timelineP.catch(() => {});
  const safe = async <T,>(p: Promise<T>, fallback: T) => { try { return await p; } catch { return fallback; } };

  const c = await contextAgent(ai, input.text, input.prior, input.history);
  timings["context"] = Date.now() - t0;

  if (c.intent === "unclear") return { kind: "clarify", message: c.clarification || "Please tell me your role and task, or ask a question about the patient.", ms: Date.now() - t0 };

  const profile =
    c.intent === "patient_summary" || c.intent === "history"
      ? GENERIC_PROFILE
      : PROFILES.find((p) => p.id === c.profileId) ?? matchProfile(`${c.role} ${c.task}`);
  const ctx: TaskContext = { role: c.role || input.prior?.role || "Clinician", task: c.task || input.prior?.task || "Overview", procedure: c.procedure ?? input.prior?.procedure ?? null, profileId: profile.id, profileName: profile.name };

  if (c.intent === "history") {
    const keys = ["diagnosis", "surgery", "radiotherapy", "endocrine", "comorbidities", "anticoagulation"];
    const { facts } = await extractFacts(ai, ctx, keys, input.lessons, t0, timings);
    const [timeline, contradictions] = await Promise.all([safe(timelineP, []), safe(contraP, ruleContradictions())]);
    markConflicts(facts, contradictions, timeline);
    return {
      kind: "history", facts, timeline, contradictions, ms: Date.now() - t0,
      plan: [
        { id: "context", label: "Understand request: patient history", dependsOn: [], output: "intent", ms: timings["context"] },
        { id: "timeline", label: "Timeline agent: dated events with quotes", dependsOn: [], output: "events", ms: timings["timeline"] },
        { id: "extract-0", label: "Extract key history facts", dependsOn: ["context"], output: "facts", ms: timings["extract-0"] },
        { id: "verify", label: "Enforced verification", dependsOn: ["timeline", "extract-0"], output: "verified", ms: Date.now() - t0 },
      ],
    };
  }

  if (c.intent === "question" && c.question) {
    const AnswerSchema = z.object({ answer: z.string(), facts: ExtractSchema.shape.facts });
    const out = await ai.object({
      schema: AnswerSchema,
      instructions: `You are the Clinical Q&A agent. ${RULES}
Answer in at most 2 short sentences. Put each supporting fact in facts (key from: ${Object.keys(FACTS).join(", ")}). If not in the documents say "Not documented".`,
      prompt: `Context: ${JSON.stringify(ctx)}\n${lessonsBlock(input.lessons, Object.keys(FACTS))}\nQuestion: ${c.question}\nPassages:\n${renderSegments(segments())}`,
    });
    const facts = out.facts.map((f) => verifyFact(f, input.lessons).fact).filter((f): f is Fact => !!f);
    const ok = facts.some((f) => f.status !== "not_documented");
    return {
      kind: "answer",
      context: ctx,
      answer: ok || /not documented/i.test(out.answer) ? out.answer : "Not documented in the available records.",
      facts,
      plan: [
        { id: "context", label: "Understand question", dependsOn: [], output: "question", ms: timings["context"] },
        { id: "answer", label: "Answer from all documents", dependsOn: ["context"], output: "answer + facts" },
        { id: "verify", label: "Enforced verification", dependsOn: ["answer"], output: "verified facts", ms: Date.now() - t0 },
      ],
      ms: Date.now() - t0,
    };
  }

  const missingKeys = input.lessons.filter((l) => l.verdict === "missing" && l.profileId === profile.id).map((l) => l.factKey);
  const keys = [...new Set([...profile.facts, ...c.extraFactKeys.filter((k) => FACTS[k]), ...missingKeys])].filter((k) => !profile.exclude.includes(k) || c.extraFactKeys.includes(k));
  const { facts, dropped, chunks } = await extractFacts(ai, ctx, keys, input.lessons, t0, timings);
  timings["verify"] = Date.now() - t0;

  const contradictions = await safe(contraP, ruleContradictions());
  const [conclusion, timeline] = await Promise.all([
    profile.conclude ? safe(conclusionAgent(ai, ctx, facts, contradictions), [] as ConclusionPoint[]) : Promise.resolve([] as ConclusionPoint[]),
    safe(timelineP, [] as TimelineEvent[]),
  ]);
  timings["conclusion"] = Date.now() - t0;
  markConflicts(facts, contradictions, timeline);

  const plan: PlanStep[] = [
    { id: "context", label: "Understand role, task and procedure", dependsOn: [], output: "task context", ms: timings["context"] },
    { id: "profile", label: `Apply hardcoded profile: ${profile.name}`, dependsOn: ["context"], output: `${keys.length} fact types` },
    ...chunks.map((g, i) => ({ id: `extract-${i}`, label: `Retrieve + extract: ${g.map((k) => FACTS[k]?.label).join(", ")}`, dependsOn: ["profile"], output: "facts with quotes", ms: timings[`extract-${i}`] })),
    { id: "contradictions", label: "Cross-check all documents for contradictions", dependsOn: [], output: "conflicts", ms: timings["contradictions"] },
    { id: "timeline", label: "Timeline agent (cached)", dependsOn: [], output: "events", ms: timings["timeline"] },
    { id: "verify", label: "Enforced verification: quote exists, numbers match", dependsOn: chunks.map((_, i) => `extract-${i}`), output: "verified facts", ms: timings["verify"] },
    ...(profile.conclude ? [{ id: "conclusion", label: "Conclusion agent (only cites verified facts)", dependsOn: ["verify", "contradictions"], output: "bullets", ms: timings["conclusion"] }] : []),
  ];

  return {
    kind: "screen",
    context: ctx,
    title: `${profile.title ?? profile.name}${ctx.procedure ? ` · ${ctx.procedure}` : ""}`,
    groups: groupFacts(keys),
    conclusion,
    timeline,
    showTimeline: !!profile.showTimeline,
    plan,
    facts,
    excluded: profile.exclude.filter((k) => !keys.includes(k)).map((k) => FACTS[k]?.label ?? k),
    contradictions,
    dropped,
    ms: Date.now() - t0,
  };
}

export function documentById(id: string) {
  return DOCUMENTS.find((d) => d.id === id) ?? null;
}
