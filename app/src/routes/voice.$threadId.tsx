import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Phone, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/clinical/app-shell";
import { ResultView } from "@/components/clinical/cards";
import { Shimmer } from "@/components/clinical/shimmer";
import { useLiveVoice, type LiveEvent } from "@/hooks/use-live-voice";
import { uid, updateThread, useStore } from "@/lib/clinical/store";
import type { TurnResult } from "@/lib/clinical/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/voice/$threadId")({
  head: () => ({
    meta: [
      { title: "Hands-free mode — Clinical Task Screen" },
      { name: "description", content: "Talk to the assistant; the task screen rebuilds live after each sentence." },
      { property: "og:title", content: "Hands-free mode — Clinical Task Screen" },
      { property: "og:description", content: "Split-screen live voice: transcript on the right, verified facts on the left." },
    ],
  }),
  component: VoicePage,
});

type Line = { id: string; role: "user" | "assistant"; text: string };
type Screen = { id: string; request: string; result: TurnResult; itemId: string };

function VoicePage() {
  const { threadId } = Route.useParams();
  const { threads } = useStore();
  const thread = threads.find((t) => t.id === threadId);
  const [lines, setLines] = useState<Line[]>([]);
  const [screens, setScreens] = useState<Screen[]>([]);
  const [working, setWorking] = useState(false);
  const lastRole = useRef<string | null>(null);

  const onEvent = (e: LiveEvent) => {
    if (e.type === "session.input_transcript.delta" || e.type === "session.output_transcript.delta") {
      const role = e.type === "session.input_transcript.delta" ? "user" : "assistant";
      const delta = String(e["delta"] ?? "");
      if (!delta) return;
      setLines((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === role && lastRole.current === role) {
          return [...prev.slice(0, -1), { ...last, text: last.text + delta }];
        }
        return [...prev, { id: uid(), role, text: delta.trimStart() }];
      });
      lastRole.current = role;
    } else if (e.type === "app.delegation.pending") {
      setWorking(true);
    } else if (e.type === "app.task_screen") {
      const result = e["result"] as TurnResult;
      const request = String(e["request"] ?? "");
      const itemId = uid();
      setScreens((prev) => [{ id: uid(), request, result, itemId }, ...prev]);
      setWorking(false);
      // Persist into the same chat so the call is part of the history.
      updateThread(threadId, (t) => ({
        ...t,
        title: t.items.length ? t.title : `Voice · ${request.slice(0, 40)}`,
        context: (result.kind === "screen" || result.kind === "answer") && result.context ? result.context : t.context,
        items: [...t.items, { id: uid(), role: "user", text: `🎙 ${request}`, at: Date.now() }, { id: itemId, role: "assistant", result, at: Date.now() }],
      }));
    } else if (e.type === "session.commentary.appended" || e.type === "app.closed") {
      setWorking(false);
    }
  };

  const call = useLiveVoice({ onEvent });
  const autoStarted = useRef(false);
  const navigate = Route.useNavigate();
  // Hands-free mode starts listening as soon as the page opens.
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    call.start();
  }, [call.start]);
  const live = call.status === "connecting" || call.status === "connected";
  const [current, ...history] = screens;

  return (
    <AppShell
      activeId={threadId}
      header={
        <>
          <span className="truncate text-sm font-medium">Hands-free · {thread?.title ?? ""}</span>
          <span className={cn("flex items-center gap-1.5 text-xs", call.status === "connected" ? "text-success" : "text-muted-foreground")}>
            <span className={cn("size-1.5 rounded-full", call.status === "connected" ? "animate-pulse bg-success" : "bg-muted-foreground")} />
            {call.status === "connected" ? (call.muted ? "Muted" : "Listening") : call.status === "connecting" ? "Connecting…" : call.status === "idle" ? "Starting…" : "Stopped"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {call.playbackBlocked && (
              <Button size="sm" variant="outline" onClick={call.resumePlayback} className="gap-1"><Play className="size-3.5" /> Tap to enable audio</Button>
            )}
            {!live && call.status !== "stopping" && (
              <Button size="sm" variant="outline" onClick={call.start} className="gap-1"><Phone className="size-3.5" /> Start listening</Button>
            )}
            <Button
              size="sm"
              variant={call.muted ? "destructive" : "default"}
              disabled={call.status !== "connected"}
              onClick={() => call.setMuted(!call.muted)}
              className="min-w-24 gap-1.5"
            >
              {call.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}{call.muted ? "Unmute" : "Mute"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { call.stop(); navigate({ to: "/chat/$threadId", params: { threadId } }); }} className="gap-1">
              <X className="size-3.5" /> Exit hands-free
            </Button>
          </div>
        </>
      }
    >
      {call.error && <div className="border-b bg-conflict-soft px-4 py-2 text-xs text-conflict">{call.error}</div>}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_22rem]">
        {/* LEFT: live task screen */}
        <section className="min-h-0 overflow-y-auto border-r px-6 py-6">
          {working && <div className="mb-4"><Shimmer label="Rebuilding screen for what you just said…" /></div>}
          {current ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="mb-2 text-xs text-muted-foreground">For: “{current.request}”</div>
              <ResultView result={current.result} loc={{ threadId, itemId: current.itemId, situation: current.request }} />
            </div>
          ) : (
            !working && (
              <div className="mt-[15vh] max-w-md">
                <h1 className="text-2xl font-semibold tracking-tight">Talk, and the screen follows.</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Just speak: say your role and task, e.g. “I'm the anaesthetist, pre-op check.” Add details like “she has an operation on Friday” — the screen rebuilds after each sentence.
                </p>
              </div>
            )
          )}
          {history.length > 0 && (
            <div className="mt-8">
              <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Earlier in this call</div>
              <div className="space-y-2">
                {history.map((s) => (
                  <details key={s.id} className="rounded-lg border px-4 py-2">
                    <summary className="cursor-pointer text-sm">{s.request}</summary>
                    <div className="mt-3"><ResultView result={s.result} /></div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* RIGHT: transcript */}
        <aside className="flex min-h-0 flex-col bg-sidebar">
          <div className="border-b px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">Transcript</div>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {lines.length === 0 && <p className="text-sm text-muted-foreground">Your words appear here.</p>}
            {lines.map((l) => (
              <p key={l.id} className={cn("text-sm leading-relaxed", l.role === "assistant" && "text-muted-foreground")}>
                <span className="mr-1 font-mono text-[10px] uppercase">{l.role === "user" ? "You" : "AI"}</span>
                {l.text}
              </p>
            ))}
            {call.status === "connecting" && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Connecting…</p>}
          </div>
          <audio ref={call.audioRef} controls className="w-full border-t px-2 py-2" />
        </aside>
      </div>
    </AppShell>
  );
}
