import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/clinical/app-shell";
import { ResultView } from "@/components/clinical/cards";
import { runClinicalTurn } from "@/lib/clinical/clinical.functions";
import { SITUATIONS } from "@/lib/clinical/cases";
import { scoreLesson, scoreQuestion, screenFacts } from "@/lib/clinical/scoring";
import { getState, removeLesson, useStore } from "@/lib/clinical/store";
import type { TurnResult } from "@/lib/clinical/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/eval")({
  head: () => ({
    meta: [
      { title: "Evaluation & learning — Clinical Task Screen" },
      { name: "description", content: "Run the benchmark situations and learned regression tests; track accuracy over time." },
      { property: "og:title", content: "Evaluation & learning" },
      { property: "og:description", content: "Benchmark situations, clinician corrections as tests, and scores over time." },
    ],
  }),
  component: EvalPage,
});

type Run = { at: number; correct: number; total: number; traceability: number; contradictions: number; slowest: number; learnedPass: number; learnedTotal: number };
const RUNS_KEY = "cts.evalruns.v1";

function EvalPage() {
  const { lessons } = useStore();
  const [results, setResults] = useState<Record<string, TurnResult>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    try { setRuns(JSON.parse(localStorage.getItem(RUNS_KEY) || "[]")); } catch { /* empty */ }
  }, []);

  const runAll = async () => {
    const out: Record<string, TurnResult> = {};
    for (const s of SITUATIONS) {
      setRunning(s.id);
      const t0 = performance.now();
      const r = await runClinicalTurn({ data: { text: `${s.title}. ${s.description}`, prior: null, history: [], lessons: getState().lessons } }).catch(
        (e) => ({ kind: "error", message: String(e), ms: 0 }) as TurnResult,
      );
      r.ms = Math.round(performance.now() - t0);
      out[s.id] = r;
      setResults({ ...out });
    }
    setRunning(null);
    const all = SITUATIONS.flatMap((s) => s.questions.map((q) => scoreQuestion(q, screenFacts(out[s.id]!))));
    const facts = Object.values(out).flatMap(screenFacts).filter((f) => f.status !== "not_documented");
    const contra = new Set(Object.values(out).flatMap((r) => (r.kind === "screen" ? r.contradictions.map((c) => c.title) : [])));
    const learned = getState().lessons.map((l) => {
      const r = Object.values(out).find((x) => x.kind === "screen" && x.context.profileId === l.profileId);
      return r ? scoreLesson(l, screenFacts(r)) : null;
    }).filter((x): x is boolean => x !== null);
    const run: Run = {
      at: Date.now(),
      correct: all.filter(Boolean).length,
      total: all.length,
      traceability: facts.length ? Math.round((facts.filter((f) => f.refs.length > 0).length / facts.length) * 100) : 0,
      contradictions: contra.size,
      slowest: Math.max(...Object.values(out).map((r) => r.ms)),
      learnedPass: learned.filter(Boolean).length,
      learnedTotal: learned.length,
    };
    const next = [run, ...runs].slice(0, 20);
    setRuns(next);
    localStorage.setItem(RUNS_KEY, JSON.stringify(next));
  };

  const last = runs[0];
  return (
    <AppShell>
      <div className="overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Evaluation & learning</h1>
              <p className="text-sm text-muted-foreground">Benchmark situations plus every clinician correction, replayed as a test.</p>
            </div>
            <Button onClick={runAll} disabled={!!running} className="gap-2"><Play className="size-4" />{running ? "Running…" : "Run all"}</Button>
          </div>

          {last && (
            <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-5">
              {[
                ["Correct answers", `${last.correct}/${last.total}`],
                ["Traceability", `${last.traceability}%`],
                ["Contradictions", String(last.contradictions)],
                ["Slowest screen", `${(last.slowest / 1000).toFixed(1)} s`],
                ["Learned tests", `${last.learnedPass}/${last.learnedTotal}`],
              ].map(([k, v]) => (
                <div key={k} className="bg-background p-4">
                  <div className="text-xs text-muted-foreground">{k}</div>
                  <div className="mt-1 font-mono text-xl">{v}</div>
                </div>
              ))}
            </div>
          )}

          <h2 className="mt-8 mb-2 text-sm font-semibold">Situations</h2>
          <div className="divide-y rounded-lg border">
            {SITUATIONS.map((s) => {
              const r = results[s.id];
              return (
                <div key={s.id} className="p-4">
                  <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen(open === s.id ? null : s.id)}>
                    <div>
                      <div className="text-sm font-medium">{s.title}</div>
                      <div className="text-xs text-muted-foreground">{s.description}</div>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{running === s.id ? "running…" : r ? `${(r.ms / 1000).toFixed(1)} s` : ""}</span>
                  </button>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {s.questions.map((q) => {
                      const ok = r ? scoreQuestion(q, screenFacts(r)) : null;
                      return (
                        <li key={q.q} className={cn("rounded border px-2 py-1 text-xs", ok === true && "border-success text-success", ok === false && "border-destructive text-destructive")}>
                          {q.q}
                        </li>
                      );
                    })}
                  </ul>
                  {open === s.id && r && <div className="mt-4"><ResultView result={r} /></div>}
                </div>
              );
            })}
          </div>

          <h2 className="mt-8 mb-2 text-sm font-semibold">Learned from clinicians ({lessons.length})</h2>
          {lessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">Confirm, reject or add missing facts on any screen. Each correction becomes a test here and is fed back into the agents.</p>
          ) : (
            <div className="divide-y rounded-lg border">
              {[...lessons].reverse().map((l) => (
                <div key={l.id} className="flex items-start gap-3 p-3 text-sm">
                  <span className={cn("mt-0.5 rounded px-1.5 py-0.5 font-mono text-[11px] uppercase", l.verdict === "confirmed" ? "bg-success-soft text-success" : l.verdict === "rejected" ? "bg-conflict-soft text-conflict" : "bg-warning-soft text-warning")}>{l.verdict}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{l.label}{l.value && <span className="font-normal text-muted-foreground"> — {l.value}</span>}</div>
                    <div className="truncate text-xs text-muted-foreground">{l.profileId} · {l.situation}</div>
                  </div>
                  <button type="button" aria-label="Remove" className="text-muted-foreground hover:text-foreground" onClick={() => removeLesson(l.id)}><Trash2 className="size-3.5" /></button>
                </div>
              ))}
            </div>
          )}

          {runs.length > 1 && (
            <>
              <h2 className="mt-8 mb-2 text-sm font-semibold">Run history</h2>
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground"><tr><th className="py-1">When</th><th>Correct</th><th>Trace</th><th>Contra.</th><th>Slowest</th><th>Learned</th></tr></thead>
                <tbody className="font-mono">
                  {runs.map((r) => (
                    <tr key={r.at} className="border-t"><td className="py-1">{new Date(r.at).toLocaleString()}</td><td>{r.correct}/{r.total}</td><td>{r.traceability}%</td><td>{r.contradictions}</td><td>{(r.slowest / 1000).toFixed(1)}s</td><td>{r.learnedPass}/{r.learnedTotal}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
