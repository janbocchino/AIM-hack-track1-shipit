const STEPS = ["Understanding role and task", "Planning required facts", "Searching documents", "Verifying every quote"];

export function Shimmer({ label }: { label?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 text-xs text-muted-foreground">{label ?? "Building your screen…"}</div>
      <ol className="space-y-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2 text-sm text-muted-foreground" style={{ animation: `pulse 1.6s ease-in-out ${i * 0.35}s infinite` }}>
            <span className="size-1.5 rounded-full bg-foreground" /> {s}
          </li>
        ))}
      </ol>
      <div className="mt-4 space-y-2">
        {[80, 65, 72].map((w) => (
          <div key={w} className="h-3 animate-pulse rounded bg-muted" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}
