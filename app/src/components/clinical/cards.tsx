import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, CircleDashed, ListTree, Plus, ShieldCheck, X, Info, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { RefChip, RefChips, formatDate, useTranslation } from "./source-panel";
import { DocumentSection, InteractionSection, MedicationSection, RiskSection } from "./chart";
import { HorizontalTimeline } from "./timeline";
import { addLesson, updateThread } from "@/lib/clinical/store";
import { FACTS, WHY_CRITICAL } from "@/lib/clinical/knowledge";
import type { ConclusionPoint, Contradiction, Fact, PlanStep, Ref, TaskContext, TurnResult } from "@/lib/clinical/types";
import { cn } from "@/lib/utils";

type Loc = { threadId: string; itemId: string; situation: string };

type Decision = "confirmed" | "rejected";
function decide(loc: Loc, key: string, d: Decision, reason?: string) {
  updateThread(loc.threadId, (t) => ({
    ...t,
    items: t.items.map((i) => {
      if (i.id !== loc.itemId || !i.result || !("facts" in i.result)) return i;
      const facts = i.result.facts.map((f) =>
        f.key === key ? { ...f, status: d === "confirmed" ? ("verified" as const) : ("not_documented" as const), decision: d, note: d === "rejected" ? `Rejected by you${reason ? `: ${reason}` : ""}` : f.note } : f,
      );
      return { ...i, result: { ...i.result, facts } as TurnResult };
    }),
  }));
}

export function StatusMark({ fact }: { fact: Fact }) {
  if (fact.decision === "confirmed") return <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Confirmed by you" />;
  if (fact.decision === "rejected") return <XCircle className="size-4 shrink-0 text-conflict" aria-label="Rejected" />;
  if (fact.status === "verified") return <ShieldCheck className="size-4 shrink-0 text-success" aria-label="Verified against source" />;
  if (fact.status === "needs_confirmation") return <AlertTriangle className="size-4 shrink-0 text-warning" aria-label="Needs confirmation" />;
  return <CircleDashed className="size-4 shrink-0 text-muted-foreground" aria-label="Not documented" />;
}

function QuoteLine({ r }: { r: Ref }) {
  const en = useTranslation(r.text);
  return (
    <div className="rounded-md border bg-background p-2.5">
      <div className="mb-1"><RefChip r={r} all={[r]} index={0} /></div>
      <div className="rounded bg-highlight/50 px-2 py-1 text-sm">“{r.text}”</div>
      <div className="mt-1 px-2 text-xs text-muted-foreground">{en ? <>EN: {en}</> : "Translating…"}</div>
    </div>
  );
}

function RejectButton({ onReject }: { onReject: (reason?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState("");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 border-conflict/40 text-conflict hover:bg-conflict-soft hover:text-conflict">
          <X className="size-3.5" /> Reject
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <p className="mb-2 text-xs font-medium">Why is this wrong?</p>
        <div className="flex flex-wrap gap-1">
          {["Outdated", "Wrong value", "Wrong source", "Not relevant"].map((r) => (
            <button key={r} type="button" className="rounded border px-2 py-1 text-xs hover:border-foreground" onClick={() => { onReject(r); setOpen(false); }}>{r}</button>
          ))}
        </div>
        <div className="mt-2 flex gap-1">
          <Input className="h-7 text-xs" placeholder="Other reason" value={other} onChange={(e) => setOther(e.target.value)} />
          <Button size="sm" className="h-7 px-2 text-xs" onClick={() => { onReject(other || undefined); setOpen(false); }}>Save</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FactRow({ fact, loc, profileId, contradictions = [], displayValue }: { fact: Fact; loc?: Loc | undefined; profileId: string; contradictions?: Contradiction[]; displayValue?: string }) {
  const [open, setOpen] = useState(false);
  const pending = fact.status === "needs_confirmation" && !fact.decision;
  const conflicts = contradictions.filter((c) => c.refs.some((r) => fact.refs.some((x) => x.segId === r.segId)));
  const record = (d: Decision, reason?: string) => {
    if (!loc) return;
    addLesson({ situation: loc.situation, profileId, factKey: fact.key, label: fact.label, value: fact.value, verdict: d, ...(reason ? { note: reason } : {}) });
    decide(loc, fact.key, d, reason);
  };
  return (
    <div
      data-pending={pending || undefined}
      className={cn(
        "my-1.5 rounded-lg transition-colors",
        pending ? "border-2 border-warning bg-warning-soft p-3" : "border border-transparent px-3 py-2 hover:border-border",
      )}
    >
      <button type="button" onClick={() => setOpen(!open)} className="grid w-full grid-cols-[1rem_9rem_1fr_1rem] items-start gap-x-3 text-left">
        <StatusMark fact={fact} />
        <div className="text-sm text-muted-foreground">{fact.label}</div>
        <div className="min-w-0">
          <div className="text-sm font-medium leading-snug">{displayValue ?? fact.value}</div>
          {fact.refs[0] && !open && <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">“{fact.refs[0].text}”</div>}
          {fact.note && <div className={cn("mt-0.5 text-xs", /conflict|Rejected/.test(fact.note) ? "text-conflict" : "text-muted-foreground")}>{fact.note}</div>}
          {fact.decision === "confirmed" && <div className="mt-0.5 text-xs text-success">Confirmed by you</div>}
        </div>
        <ChevronDown className={cn("mt-0.5 size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {pending && loc && (
        <div className="mt-3 flex flex-wrap items-center gap-2 pl-7">
          <span className="mr-1 text-xs font-medium text-warning">Action needed — check the source, then:</span>
          <Button size="sm" className="h-8 gap-1.5" onClick={() => record("confirmed")}><Check className="size-3.5" /> Confirm</Button>
          <RejectButton onReject={(r) => record("rejected", r)} />
          {!open && <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => setOpen(true)}><Info className="size-3.5" /> Why?</Button>}
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-2 pl-7">
          {fact.refs.map((r) => <QuoteLine key={r.segId} r={r} />)}
          {conflicts.map((c) => (
            <div key={c.id} className="rounded-md border border-conflict/30 bg-conflict-soft p-2.5 text-xs">
              <div className="font-medium text-conflict">Conflict: {c.title}</div>
              <div className="text-muted-foreground">{c.explanation}</div>
              <div className="mt-1"><RefChips refs={c.refs} /></div>
            </div>
          ))}
          {fact.critical && (
            <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Why critical: </span>{WHY_CRITICAL[fact.key] ?? "Safety-relevant for this task; a wrong value could cause harm."}</p>
          )}
          {!fact.refs.length && <p className="text-xs text-muted-foreground">No passage in the 8 documents mentions this.</p>}
        </div>
      )}
    </div>
  );
}

export function PlanRow({ plan, ms, dropped, excluded }: { plan: PlanStep[]; ms: number; dropped?: number; excluded?: string[] }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ListTree className="size-3.5" /> Details
        <ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
          <div className="font-mono">{(ms / 1000).toFixed(1)} s · {plan.length} agent steps{dropped ? ` · ${dropped} unverified answers removed` : ""}</div>
          <ol className="space-y-1 border-l border-border pl-4">
            {plan.map((p) => (
              <li key={p.id}>
                <span className="font-mono">{p.id}</span> <span className="text-foreground">{p.label}</span>
                {p.dependsOn.length > 0 && <span> ← {p.dependsOn.join(", ")}</span>}
                {p.ms != null && <span className="font-mono"> · {(p.ms / 1000).toFixed(1)} s</span>}
              </li>
            ))}
          </ol>
          {excluded && excluded.length > 0 && <p>Left out as not relevant for this task: {excluded.join(", ")}.</p>}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ContradictionsCard({ items }: { items: Contradiction[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <section className="rounded-lg border border-conflict/30 bg-conflict-soft">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-conflict">
        <AlertTriangle className="size-4 shrink-0" /> <span className="shrink-0 whitespace-nowrap">{items.length} contradiction{items.length > 1 ? "s" : ""} in the documents</span>
        <span className="hidden min-w-0 truncate text-xs font-normal sm:inline">— {items.map((c) => c.title).join(" · ")}</span>
        <ChevronDown className={cn("ml-auto size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="space-y-3 border-t border-conflict/20 px-4 py-3">
          {items.map((c) => (
            <li key={c.id} className="text-sm">
              <div className="font-medium">{c.title}</div>
              <div className="text-muted-foreground">{c.explanation}</div>
              <div className="mt-1"><RefChips refs={c.refs} /></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ConclusionBox({ points, facts }: { points: ConclusionPoint[]; facts: Fact[] }) {
  if (!points.length) return null;
  return (
    <div className="rounded-lg bg-primary p-4 text-primary-foreground">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide opacity-70">Conclusion</div>
      <ul className="space-y-1.5">
        {points.map((p, i) => {
          const refs = p.factKeys.flatMap((k) => facts.find((f) => f.key === k)?.refs.slice(0, 1) ?? []);
          return (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", p.severity === "high" ? "bg-conflict" : p.severity === "medium" ? "bg-warning" : "bg-primary-foreground/50")} />
              <span className="flex-1">{p.text}</span>
              <span className="shrink-0 font-mono text-[10px] opacity-60">{refs.map((r) => `${r.docTitleEn ?? r.docTitle}, ${formatDate(r.date)}`).slice(0, 1).join("")}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] opacity-60">Built only from verified facts on this screen.</p>
    </div>
  );
}

function MissingFact({ loc, ctx, present }: { loc: Loc; ctx: TaskContext; present: string[] }) {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const options = Object.values(FACTS).filter((f) => !present.includes(f.key));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground"><Plus className="size-3" /> Missing a fact?</Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <p className="mb-2 text-xs text-muted-foreground">This fact will be added to “{ctx.profileName}” from now on and becomes a test case.</p>
        <Input className="mb-2 h-8 text-xs" placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">
          {options.map((o) => (
            <button key={o.key} type="button" className="rounded border px-2 py-1 text-xs hover:border-foreground"
              onClick={() => { addLesson({ situation: loc.situation, profileId: ctx.profileId, factKey: o.key, label: o.label, value: "", verdict: "missing", ...(note ? { note } : {}) }); setOpen(false); }}>
              {o.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FactList({ facts, loc, profileId, contradictions, groups, inset = true, showMissing = true }: { facts: Fact[]; loc?: Loc | undefined; profileId: string; contradictions: Contradiction[]; groups?: { name: string; keys: string[] }[]; inset?: boolean; showMissing?: boolean }) {
  const documented = facts.filter((f) => f.status !== "not_documented" || (f as { decision?: Decision }).decision);
  const gs = (groups ?? [{ name: "", keys: facts.map((f) => f.key) }])
    .map((g) => ({ ...g, keys: g.keys.filter((k) => k !== "medication") }))
    .filter((g) => g.keys.length);
  const scoped = new Set(gs.flatMap((g) => g.keys));
  const missing = facts.filter((f) => f.key !== "medication" && scoped.has(f.key) && f.status === "not_documented" && !(f as { decision?: Decision }).decision);
  return (
    <>
      {gs.map((g) => {
        const list = documented.filter((f) => g.keys.includes(f.key));
        if (!list.length) return null;
        return (
          <div key={g.name || "facts"} className={cn("overflow-hidden rounded-lg border", inset && "mx-3 mt-3")}>
            {g.name && <div className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.name}</div>}
            <div className="py-1">
              {list.map((f) => <FactRow key={f.key} fact={f} loc={loc} profileId={profileId} contradictions={contradictions} />)}
            </div>
          </div>
        );
      })}
      {showMissing && missing.length > 0 && (
        <div className={cn("mt-3 flex items-start gap-2 text-xs text-muted-foreground", inset ? "mx-5 border-t pt-3" : "px-1")}>
          <CircleDashed className="mt-0.5 size-3.5 shrink-0" />
          <span><span className="font-medium text-foreground">Not documented:</span> {missing.map((f) => f.label).join(", ")}</span>
        </div>
      )}
    </>
  );
}

function ConfirmBanner({ count, id }: { count: number; id: string }) {
  if (!count) return null;
  return (
    <div className="flex items-center gap-3 border-b-2 border-warning bg-warning-soft px-4 py-2.5">
      <AlertTriangle className="size-4 text-warning" />
      <span className="text-sm font-medium">{count} critical fact{count > 1 ? "s" : ""} need{count > 1 ? "" : "s"} your confirmation</span>
      <Button size="sm" variant="outline" className="ml-auto h-7 text-xs"
        onClick={() => document.getElementById(id)?.querySelector("[data-pending]")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
        Review
      </Button>
    </div>
  );
}

export function ResultView({ result, loc }: { result: TurnResult; loc?: Loc | undefined }) {
  if (result.kind === "error") return <div className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{result.message}</div>;
  if (result.kind === "clarify") return <div className="rounded-lg border p-4 text-sm">{result.message}</div>;
  if (result.kind === "summary") return null;

  if (result.kind === "answer") {
    const shown = result.facts.filter((f) => f.status !== "not_documented" || result.facts.length === 1);
    return (
      <section className="rounded-lg border bg-card p-4">
        <p className="text-[15px] font-medium leading-snug">{result.answer}</p>
        {shown.length > 0 && <div className="-mx-2 mt-2"><FactList facts={shown} loc={loc} profileId={result.context?.profileId ?? "generic"} contradictions={[]} /></div>}
        <div className="mt-3"><PlanRow plan={result.plan} ms={result.ms} /></div>
      </section>
    );
  }

  if (result.kind === "history") {
    const medication = result.facts.find((f) => f.key === "medication");
    return (
      <div className="space-y-3">
        <HorizontalTimeline events={result.timeline} />
        <MedicationSection footer={medication && (medication.status === "needs_confirmation" || medication.decision) ? <div className="border-t"><FactRow fact={medication} loc={loc} profileId="generic" contradictions={result.contradictions} displayValue="Confirm this list against the source quote." /></div> : undefined} />
        <InteractionSection />
        <RiskSection />
        <DocumentSection />
        <section className="rounded-lg border bg-card pb-3">
          <h2 className="px-5 pt-4 text-base font-semibold">Key facts</h2>
          <FactList facts={result.facts} loc={loc} profileId="generic" contradictions={result.contradictions} />
          <div className="px-5 pt-3"><PlanRow plan={result.plan} ms={result.ms} /></div>
        </section>
        <ContradictionsCard items={result.contradictions} />
      </div>
    );
  }

  const pending = result.facts.filter((f) => f.status === "needs_confirmation" && !(f as { decision?: Decision }).decision).length;
  const cardId = `card-${loc?.itemId ?? "x"}`;
  const medication = result.facts.find((f) => f.key === "medication");
  const risks = result.groups.filter((g) => g.name === "Risks");
  const rest = result.groups.filter((g) => g.name !== "Risks");
  const riskKeys = risks.flatMap((g) => g.keys);
  const hasRiskFacts = result.facts.some((f) => riskKeys.includes(f.key) && (f.status !== "not_documented" || f.decision));
  const medFooter = medication && (medication.status === "needs_confirmation" || medication.decision)
    ? <div className="border-t"><FactRow fact={medication} loc={loc} profileId={result.context.profileId} contradictions={result.contradictions} displayValue="Confirm this list against the source quote." /></div>
    : undefined;
  return (
    <div className="space-y-3">
      <section id={cardId} className="overflow-hidden rounded-lg border bg-card">
        <header className="flex flex-wrap items-start justify-between gap-2 px-5 pb-3 pt-4">
          <div>
            <h2 className="text-lg font-semibold leading-tight tracking-tight">{result.title ?? result.context.profileName}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Anna Musterfrau · for {result.context.role}</p>
          </div>
          {loc && <MissingFact loc={loc} ctx={result.context} present={result.facts.map((f) => f.key)} />}
        </header>
        <ConfirmBanner count={pending} id={cardId} />
        {result.conclusion?.length > 0 && <div className="px-5 pt-4"><ConclusionBox points={result.conclusion} facts={result.facts} /></div>}
        <div className="space-y-3 px-3 pt-4">
          <MedicationSection footer={medFooter} />
          <InteractionSection />
          {hasRiskFacts
            ? <FactList facts={result.facts} loc={loc} profileId={result.context.profileId} contradictions={result.contradictions} groups={risks} inset={false} />
            : <RiskSection />}
          <FactList facts={result.facts} loc={loc} profileId={result.context.profileId} contradictions={result.contradictions} groups={hasRiskFacts ? rest : [...rest, ...risks]} inset={false} />
          <DocumentSection />
        </div>
        <footer className="mt-3 border-t px-5 py-2.5">
          <PlanRow plan={result.plan} ms={result.ms} dropped={result.dropped} excluded={result.excluded} />
        </footer>
      </section>
      {result.timeline?.length > 0 && <HorizontalTimeline events={result.timeline} defaultOpen={result.showTimeline} />}
      <ContradictionsCard items={result.contradictions} />
    </div>
  );
}
