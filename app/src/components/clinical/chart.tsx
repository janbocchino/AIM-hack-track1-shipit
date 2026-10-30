import type { ReactNode } from "react";
import { AlertTriangle, Ban, FileText, Pill, ShieldAlert } from "lucide-react";
import { DOCUMENTS } from "@/lib/clinical/data";
import { chartDocuments, chartRisks, clashLabel, clashesInside, currentMedications, type ClashSeverity } from "@/lib/clinical/medications";
import { cn } from "@/lib/utils";
import { formatDate, RefChip, useSource } from "./source-panel";

function Section({ icon, title, hint, children, tone = "default" }: { icon: ReactNode; title: string; hint?: string; children: ReactNode; tone?: "default" | "conflict" }) {
  return (
    <section className={cn("overflow-hidden rounded-lg border bg-card", tone === "conflict" && "border-conflict/30")}>
      <header className={cn("flex items-start gap-2 border-b px-4 py-2.5", tone === "conflict" ? "bg-conflict-soft" : "bg-muted/40")}>
        <span className={cn("mt-0.5", tone === "conflict" ? "text-conflict" : "text-muted-foreground")}>{icon}</span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function severityClass(severity: ClashSeverity) {
  if (severity === "contraindicated") return "text-conflict";
  if (severity === "separate") return "text-foreground";
  return "text-warning";
}

export function MedicationSection({ footer }: { footer?: ReactNode }) {
  const meds = currentMedications();
  const source = meds[0]?.ref;
  return (
    <Section
      icon={<Pill className="size-4" />}
      title="Current medication"
      hint={source ? `From the latest medication list · ${source.docTitleEn ?? source.docTitle}, ${formatDate(source.date)}` : "No medication list in the documents."}
    >
      <ul className="divide-y">
        {meds.map((m) => (
          <li key={m.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-medium">{m.name}</div>
              <div className="text-xs text-muted-foreground">
                {[m.dose, m.schedule, m.drugClass].filter(Boolean).join(" · ")}
              </div>
            </div>
            <RefChip r={m.ref} all={[m.ref]} index={0} />
          </li>
        ))}
      </ul>
      {footer}
    </Section>
  );
}

export function InteractionSection() {
  const meds = currentMedications();
  const inside = clashesInside(meds);
  return (
    <Section
      icon={<Ban className="size-4" />}
      title="Do not combine"
      hint="Each current medicine was checked against known combinations that should not be taken with it."
      tone="conflict"
    >
      <div className="space-y-3 px-4 py-3">
        <p className={cn("rounded-md px-3 py-2 text-xs", inside.length ? "bg-conflict-soft text-conflict" : "bg-success-soft text-success")}>
          {inside.length
            ? "The current list already contains a combination to avoid."
            : "Nothing in the current list is contraindicated with another medicine she is already taking."}
        </p>
        {inside.map((c) => (
          <p key={c.id} className="text-sm">
            <span className="font-medium">{c.taken}</span> with <span className="font-medium">{c.other}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{c.reason}</span>
          </p>
        ))}
        {meds.map((m) => (
          <div key={m.id}>
            <div className="text-sm font-medium">{m.name}</div>
            {m.clashes.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">No entry for this name in the interaction list.</p>
            ) : (
              <ul className="mt-1.5 space-y-1.5">
                {m.clashes.map((c) => {
                  const examples = c.examples.filter((e) => e.toLowerCase() !== c.title.toLowerCase());
                  return (
                    <li key={c.id} className="rounded-md border bg-background px-3 py-2">
                      <div className={cn("text-[11px] font-semibold uppercase tracking-wide", severityClass(c.severity))}>{clashLabel(c.severity)}</div>
                      <div className="text-sm font-medium leading-snug">{c.title}</div>
                      {examples.length > 0 && <div className="text-xs text-muted-foreground">{examples.join(", ")}</div>}
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{c.reason}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground">Decision support from the chart and a built-in interaction list. Confirm in a drug reference before prescribing.</p>
      </div>
    </Section>
  );
}

export function RiskSection() {
  const risks = chartRisks();
  return (
    <Section icon={<ShieldAlert className="size-4" />} title="Risks" hint="Safety items named in the documents.">
      <ul className="divide-y">
        {risks.map((r) => (
          <li key={r.id} className="px-4 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <AlertTriangle className="size-3.5 text-warning" /> {r.title}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{r.detail}</p>
              </div>
              <RefChip r={r.ref} all={[r.ref]} index={0} />
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function DocumentSection() {
  const { open } = useSource();
  const docs = chartDocuments();
  return (
    <Section icon={<FileText className="size-4" />} title="Documents" hint={`${DOCUMENTS.length} source documents, oldest first.`}>
      <ul className="grid gap-px bg-border sm:grid-cols-2">
        {docs.map((d) => (
          <li key={d.id} className="bg-card">
            <button
              type="button"
              onClick={() => open([`${d.id}#0`], 0)}
              className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-muted/50"
            >
              <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-snug">{d.titleEn}</span>
                <span className="block truncate text-xs text-muted-foreground">{formatDate(d.date)} · {d.title}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
