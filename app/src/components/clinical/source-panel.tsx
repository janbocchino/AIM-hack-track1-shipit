import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { getSourceDocument, translateSegment } from "@/lib/clinical/clinical.functions";
import type { SourceDoc } from "@/lib/clinical/data";
import type { Ref } from "@/lib/clinical/types";
import { cn } from "@/lib/utils";

type Ctx = { open: (segIds: string[], index?: number) => void };
const SourceCtx = createContext<Ctx>({ open: () => {} });
export const useSource = () => useContext(SourceCtx);

export function formatDate(iso: string) {
  const d = new Date(iso.length === 7 ? `${iso}-01` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", iso.length === 7 ? { month: "short", year: "numeric" } : { day: "numeric", month: "short", year: "numeric" });
}

/** Cache translations client-side so expanding a fact twice costs nothing. */
const tCache = new Map<string, Promise<string>>();
export function useTranslation(text: string | undefined) {
  const [out, setOut] = useState("");
  useEffect(() => {
    if (!text) return;
    let alive = true;
    if (!tCache.has(text)) tCache.set(text, translateSegment({ data: { text } }));
    tCache.get(text)!.then((t) => alive && setOut(t));
    return () => { alive = false; };
  }, [text]);
  return out;
}

export function SourceProvider({ children }: { children: ReactNode }) {
  const [segIds, setSegIds] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [doc, setDoc] = useState<SourceDoc | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const current = segIds?.[index];
  const docId = current?.split("#")[0];
  const line = doc && current ? doc.lines[Number(current.split("#")[1])] : undefined;
  const translation = useTranslation(line);

  useEffect(() => {
    if (!docId) return;
    let alive = true;
    if (doc?.id !== docId) {
      setDoc(null);
      getSourceDocument({ data: { id: docId } }).then((d) => alive && setDoc(d));
    }
    return () => { alive = false; };
  }, [docId, doc?.id]);

  useEffect(() => {
    if (!doc || !current) return;
    requestAnimationFrame(() => {
      scrollRef.current?.querySelector(`[data-seg="${current}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [doc, current]);

  const highlighted = new Set((segIds ?? []).filter((s) => s.startsWith(`${docId}#`)));
  const total = segIds?.length ?? 0;

  return (
    <SourceCtx.Provider value={{ open: (ids, i = 0) => { setSegIds(ids); setIndex(i); } }}>
      {children}
      <Sheet open={!!segIds} onOpenChange={(o) => !o && setSegIds(null)}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle className="text-base">{doc ? doc.titleEn : "Loading source…"}</SheetTitle>
            <SheetDescription>{doc ? `${doc.title} · ${formatDate(doc.date)} · ${doc.author}` : " "}</SheetDescription>
            {total > 1 && (
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" disabled={index === 0} onClick={() => setIndex(index - 1)}>
                  <ChevronLeft className="size-3" /> Previous
                </Button>
                <span className="font-mono text-xs text-muted-foreground">Reference {index + 1} of {total}</span>
                <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" disabled={index >= total - 1} onClick={() => setIndex(index + 1)}>
                  Next <ChevronRight className="size-3" />
                </Button>
              </div>
            )}
          </SheetHeader>
          {line && (
            <div className="border-b bg-highlight/40 px-6 py-3 text-sm">
              <div className="font-medium">{line}</div>
              {translation && <div className="mt-1 text-muted-foreground"><span className="mr-1 font-mono text-[10px] uppercase">EN</span>{translation}</div>}
            </div>
          )}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
            {doc?.lines.map((l, i) => {
              const id = `${doc.id}#${i}`;
              return (
                <p key={id} data-seg={id} className={cn("rounded px-2 py-1.5 text-sm leading-relaxed", highlighted.has(id) && "bg-highlight", id === current && "font-medium ring-1 ring-foreground/20")}>
                  <span className="mr-2 select-none font-mono text-xs text-muted-foreground">{i + 1}</span>
                  {l}
                </p>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </SourceCtx.Provider>
  );
}

export function RefChip({ r, all, index }: { r: Ref; all: Ref[]; index: number }) {
  const { open } = useSource();
  return (
    <HoverCard openDelay={150} closeDelay={50}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); open(all.map((x) => x.segId), index); }}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        >
          <FileText className="size-3" />
          {r.docTitleEn ?? r.docTitle} · {formatDate(r.date)}
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 text-xs" align="start">
        <div className="mb-1 font-medium">{r.docTitleEn ?? r.docTitle}</div>
        <div className="mb-2 text-muted-foreground">{r.docTitle} · {formatDate(r.date)} · line {Number(r.segId.split("#")[1]) + 1}</div>
        <div className="rounded bg-highlight/50 px-2 py-1.5 leading-relaxed">“{r.text}”</div>
        <div className="mt-2 text-muted-foreground">Click to open the full document</div>
      </HoverCardContent>
    </HoverCard>
  );
}

export function RefChips({ refs }: { refs: Ref[] }) {
  if (!refs.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {refs.map((r, i) => <RefChip key={r.segId} r={r} all={refs} index={i} />)}
    </span>
  );
}
