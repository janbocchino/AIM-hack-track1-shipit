import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/clinical/shimmer";
import { AppShell } from "@/components/clinical/app-shell";
import { ResultView } from "@/components/clinical/cards";
import { DocumentSection, InteractionSection, MedicationSection, RiskSection } from "@/components/clinical/chart";
import { Composer } from "@/components/clinical/composer";
import { sendTurn } from "@/lib/clinical/send-turn";
import { createThread, useStore } from "@/lib/clinical/store";
import { SITUATIONS } from "@/lib/clinical/cases";

export const Route = createFileRoute("/chat/$threadId")({
  head: () => ({
    meta: [
      { title: "Chat — Clinical Task Screen" },
      { name: "description", content: "Ask for a role- and task-specific patient screen with linked sources." },
      { property: "og:title", content: "Chat — Clinical Task Screen" },
      { property: "og:description", content: "Structured, source-linked patient facts for your clinical task." },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { threadId } = Route.useParams();
  const { threads, loaded } = useStore();
  const thread = threads.find((t) => t.id === threadId);
  const [busy, setBusy] = useState(false);

  const send = async (text: string) => {
    setBusy(true);
    await sendTurn(threadId, text);
    setBusy(false);
  };

  if (loaded && !thread) {
    return (
      <AppShell>
        <div className="m-auto text-center">
          <p className="text-sm text-muted-foreground">This chat does not exist in this browser.</p>
          <Link to="/chat/$threadId" params={{ threadId: createThread() }} className="mt-3 inline-block text-sm underline">Start a new chat</Link>
        </div>
      </AppShell>
    );
  }

  const items = thread?.items ?? [];
  const lastUser = (idx: number) => [...items.slice(0, idx)].reverse().find((i) => i.role === "user")?.text ?? "";

  return (
    <AppShell
      activeId={threadId}
      header={
        <span className="truncate text-sm font-medium">{thread?.title ?? ""}</span>
      }
    >
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl px-4 py-8">
          {items.length === 0 && (
            <div className="mt-[12vh]">
              <h1 className="text-2xl font-semibold tracking-tight">Who are you, and what are you doing?</h1>
              <p className="mt-1 text-sm text-muted-foreground">Patient: Anna Musterfrau · 8 documents · 2015–2016. Every fact links to its source.</p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {SITUATIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={busy}
                    onClick={() => send(`${s.title}. ${s.description}`)}
                    className="rounded-lg border p-3 text-left text-sm transition-colors hover:border-foreground"
                  >
                    <div className="font-medium">{s.title}</div>
                    <div className="line-clamp-2 text-xs text-muted-foreground">{s.description}</div>
                  </button>
                ))}
              </div>
              <div className="mt-8 space-y-3">
                <h2 className="text-sm font-semibold tracking-tight">Patient chart</h2>
                <MedicationSection />
                <InteractionSection />
                <RiskSection />
                <DocumentSection />
              </div>
            </div>
          )}
          {items.map((i, idx) =>
            i.role === "user" ? (
              <Message key={i.id} from="user">
                <MessageContent>{i.text}</MessageContent>
              </Message>
            ) : (
              <div key={i.id} className="w-full">
                {i.pending ? (
                  <Shimmer />
                ) : i.result ? (
                  <ResultView result={i.result} loc={{ threadId, itemId: i.id, situation: lastUser(idx) }} />
                ) : null}
              </div>
            ),
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <Composer threadId={threadId} busy={busy} onSend={send} />
      </div>
    </AppShell>
  );
}
