import type { CaseQuestion } from "./cases";
import type { Fact, Lesson, TurnResult } from "./types";

/** A question counts as answered when the expected value is on screen with a source link. */
export function scoreQuestion(q: CaseQuestion, facts: Fact[]): boolean {
  const pool = q.factKey ? facts.filter((f) => f.key === q.factKey) : facts;
  if (q.notDocumented) return pool.length > 0 && pool.every((f) => f.status === "not_documented");
  return pool.some(
    (f) => f.status !== "not_documented" && f.refs.length > 0 && q.expectAny.some((e) => new RegExp(`\\b${e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(f.value)),
  );
}

/** Learned regression tests: rejected values must not reappear, confirmed values must stay. */
export function scoreLesson(l: Lesson, facts: Fact[]): boolean | null {
  const f = facts.find((x) => x.key === l.factKey);
  if (l.verdict === "missing") return !!f;
  if (!f) return null;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  if (l.verdict === "rejected") return norm(f.value) !== norm(l.value);
  return f.status !== "not_documented";
}

export function screenFacts(r: TurnResult): Fact[] {
  return r.kind === "screen" || r.kind === "answer" ? r.facts : [];
}
