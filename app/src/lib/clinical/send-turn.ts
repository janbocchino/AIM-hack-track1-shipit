import { runClinicalTurn } from "./clinical.functions";
import { getState, getThread, uid, updateThread } from "./store";
import type { TurnResult } from "./types";

/** Sends one clinician turn through the agent pipeline and stores the result in the thread. */
export async function sendTurn(threadId: string, text: string): Promise<TurnResult | null> {
  const thread = getThread(threadId);
  if (!thread || !text.trim()) return null;
  const pendingId = uid();
  const history = thread.items
    .slice(-8)
    .map((i) => (i.role === "user" ? `Clinician: ${i.text}` : i.result?.kind === "screen" ? `System: showed ${i.result.context.profileName} screen` : `System: ${i.result?.kind}`));
  updateThread(threadId, (t) => ({
    ...t,
    title: t.items.length ? t.title : text.slice(0, 48),
    items: [
      ...t.items,
      { id: uid(), role: "user", text, at: Date.now() },
      { id: pendingId, role: "assistant", pending: true, at: Date.now() },
    ],
  }));
  let result: TurnResult;
  try {
    result = await runClinicalTurn({ data: { text, prior: thread.context, history, lessons: getState().lessons } });
  } catch (e) {
    result = { kind: "error", message: (e as Error).message || "Request failed", ms: 0 };
  }
  updateThread(threadId, (t) => ({
    ...t,
    context: result.kind === "screen" || (result.kind === "answer" && result.context) ? (result as { context: typeof t.context }).context : t.context,
    title: result.kind === "screen" && t.title === text.slice(0, 48) ? `${result.context.role} · ${result.context.task}`.slice(0, 60) : t.title,
    items: t.items.map((i) => (i.id === pendingId ? { ...i, pending: false, result } : i)),
  }));
  return result;
}
