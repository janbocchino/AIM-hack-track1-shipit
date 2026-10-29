import { useSyncExternalStore } from "react";
import type { Lesson, TaskContext, TurnResult } from "./types";

export type ChatItem = { id: string; role: "user" | "assistant"; text?: string; result?: TurnResult; at: number; pending?: boolean };
export type Thread = { id: string; title: string; updatedAt: number; items: ChatItem[]; context: TaskContext | null };

const T_KEY = "cts.threads.v1";
const L_KEY = "cts.lessons.v1";

type State = { threads: Thread[]; lessons: Lesson[]; loaded: boolean };
let state: State = { threads: [], lessons: [], loaded: false };
const EMPTY: State = { threads: [], lessons: [], loaded: false };
const listeners = new Set<() => void>();

function load() {
  if (state.loaded || typeof window === "undefined") return;
  try {
    state = {
      threads: JSON.parse(localStorage.getItem(T_KEY) || "[]"),
      lessons: JSON.parse(localStorage.getItem(L_KEY) || "[]"),
      loaded: true,
    };
  } catch {
    state = { threads: [], lessons: [], loaded: true };
  }
}

function set(next: Partial<State>) {
  load();
  state = { ...state, ...next };
  if (next.threads) localStorage.setItem(T_KEY, JSON.stringify(state.threads));
  if (next.lessons) localStorage.setItem(L_KEY, JSON.stringify(state.lessons));
  listeners.forEach((l) => l());
}

export function useStore(): State {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => { load(); return state; },
    () => EMPTY,
  );
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function getState() { load(); return state; }

/** Idempotent: returns newest thread or creates exactly one. */
export function ensureThread(): string {
  load();
  if (state.threads.length) return [...state.threads].sort((a, b) => b.updatedAt - a.updatedAt)[0]!.id;
  return createThread();
}

export function createThread(): string {
  load();
  const t: Thread = { id: uid(), title: "New chat", updatedAt: Date.now(), items: [], context: null };
  set({ threads: [t, ...state.threads] });
  return t.id;
}

export function deleteThread(id: string) {
  load();
  set({ threads: state.threads.filter((t) => t.id !== id) });
}

export function updateThread(id: string, fn: (t: Thread) => Thread) {
  load();
  set({ threads: state.threads.map((t) => (t.id === id ? { ...fn(t), updatedAt: Date.now() } : t)) });
}

export function getThread(id: string) {
  load();
  return state.threads.find((t) => t.id === id);
}

export function addLesson(l: Omit<Lesson, "id" | "createdAt">) {
  load();
  // a newer verdict on the same fact+value replaces the older one
  const rest = state.lessons.filter((x) => !(x.factKey === l.factKey && x.value === l.value && x.profileId === l.profileId));
  set({ lessons: [...rest, { ...l, id: uid(), createdAt: Date.now() }] });
}

export function removeLesson(id: string) {
  load();
  set({ lessons: state.lessons.filter((l) => l.id !== id) });
}
