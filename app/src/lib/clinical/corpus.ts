import { DOCUMENTS } from "./data";
import type { Ref } from "./types";

export type Segment = Ref & { idx: number };

let cache: Segment[] | null = null;
export function segments(): Segment[] {
  if (cache) return cache;
  cache = DOCUMENTS.flatMap((d) =>
    d.lines.map((text, idx) => ({ segId: `${d.id}#${idx}`, docId: d.id, docTitle: d.title, docTitleEn: d.titleEn, date: d.date, text, idx })),
  );
  return cache;
}

export function segById(id: string): Segment | undefined {
  return segments().find((s) => s.segId === id);
}

export function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[\u00a0\s]+/g, " ")
    .replace(/[„“"'’]/g, "")
    .trim();
}

/** Domain-aware keyword retrieval: segments that mention any term. */
export function retrieve(terms: string[]): Segment[] {
  const t = terms.map((x) => x.toLowerCase());
  return segments().filter((s) => {
    const n = s.text.toLowerCase();
    return t.some((term) => n.includes(term));
  });
}

export function renderSegments(segs: Segment[]) {
  return segs.map((s) => `[${s.segId}] (${s.docTitle}, ${s.date}) ${s.text}`).join("\n");
}
