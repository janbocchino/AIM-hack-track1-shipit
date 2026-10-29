import { useState } from "react";
import { ChevronDown, History } from "lucide-react";
import type { TimelineEvent } from "@/lib/clinical/types";
import { formatDate, useSource } from "./source-panel";
import { cn } from "@/lib/utils";

const KIND_DOT: Record<string, string> = {
  diagnosis: "bg-foreground",
  procedure: "bg-foreground ring-4 ring-foreground/10",
  therapy: "bg-background border-2 border-foreground",
  complication: "bg-warning",
  visit: "bg-muted-foreground",
};

export function HorizontalTimeline({ events, defaultOpen = true }: { events: TimelineEvent[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const { open: openSource } = useSource();
  if (!events.length) return null;
  const first = events[0]!.date.slice(0, 4);
  const last = events[events.length - 1]!.date.slice(0, 4);

  return (
    <section className="rounded-lg border bg-card">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm">
        <History className="size-4" />
        <span className="font-medium">Patient history</span>
        <span className="text-xs text-muted-foreground">{events.length} events · {first}{last !== first ? `–${last}` : ""}</span>
        {!open && (
          <span className="ml-2 hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:block">
            {events.map((e) => e.label).join(" → ")}
          </span>
        )}
        <ChevronDown className={cn("ml-auto size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="overflow-x-auto border-t px-4 pb-4 pt-5">
          <ol className="relative flex min-w-max">
            <div className="absolute left-0 right-0 top-[7px] h-px bg-border" aria-hidden />
            {events.map((e) => (
              <li key={e.id} className="relative w-32 shrink-0 pr-3">
                <button
                  type="button"
                  onClick={() => openSource(e.refs.map((r) => r.segId))}
                  className="group flex flex-col items-start text-left"
                  title={e.refs[0]?.text}
                >
                  {e.conflict ? (
                    <span className="relative z-10 flex size-3.5 overflow-hidden rounded-full border-2 border-conflict" aria-label="Conflicting dates">
                      <span className="w-1/2 bg-conflict" /><span className="w-1/2 bg-background" />
                    </span>
                  ) : (
                    <span className={cn("relative z-10 size-3.5 rounded-full", KIND_DOT[e.kind] ?? "bg-foreground")} />
                  )}
                  <span className={cn("mt-2 font-mono text-[11px]", e.conflict ? "text-conflict" : "text-muted-foreground")}>{formatDate(e.date)}</span>
                  <span className="text-xs font-medium leading-tight group-hover:underline">{e.label}</span>
                  <span className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">{e.refs[0]?.docTitleEn ?? e.refs[0]?.docTitle}</span>
                </button>
              </li>
            ))}
          </ol>
          {events.some((e) => e.conflict) && (
            <p className="mt-3 text-[11px] text-conflict">Half-red dots: the documents give conflicting dates for this event.</p>
          )}
        </div>
      )}
    </section>
  );
}
