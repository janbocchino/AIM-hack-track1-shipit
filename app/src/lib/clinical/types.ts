export type FactStatus = "verified" | "needs_confirmation" | "not_documented";

export type Ref = { segId: string; docId: string; docTitle: string; docTitleEn?: string | undefined; date: string; text: string };

export type Fact = {
  key: string;
  label: string;
  value: string;
  status: FactStatus;
  critical: boolean;
  refs: Ref[];
  note?: string | null | undefined; // e.g. "calculated", "conflicting sources"
  decision?: "confirmed" | "rejected" | undefined;
};

export type Contradiction = {
  id: string;
  title: string;
  explanation: string;
  refs: Ref[];
};

export type ConclusionPoint = { text: string; factKeys: string[]; severity: "high" | "medium" | "info" };
export type TimelineEvent = { id: string; date: string; label: string; kind: string; refs: Ref[]; conflict: boolean };
export type FactGroup = { name: string; keys: string[] };

export type PlanStep = { id: string; label: string; dependsOn: string[]; output: string; ms?: number | undefined };

export type TaskContext = {
  role: string;
  task: string;
  procedure: string | null;
  profileId: string;
  profileName: string;
};

export type TurnResult =
  | {
      kind: "screen";
      context: TaskContext;
      title: string;
      groups: FactGroup[];
      conclusion: ConclusionPoint[];
      timeline: TimelineEvent[];
      showTimeline: boolean;
      plan: PlanStep[];
      facts: Fact[];
      excluded: string[];
      contradictions: Contradiction[];
      dropped: number; // facts rejected by verifier
      ms: number;
    }
  | { kind: "answer"; context: TaskContext | null; answer: string; facts: Fact[]; plan: PlanStep[]; ms: number }
  | { kind: "summary"; facts: Fact[]; contradictions: Contradiction[]; ms: number }
  | { kind: "history"; facts: Fact[]; timeline: TimelineEvent[]; contradictions: Contradiction[]; plan: PlanStep[]; ms: number }
  | { kind: "clarify"; message: string; ms: number }
  | { kind: "error"; message: string; ms: number };

export type Lesson = {
  id: string;
  createdAt: number;
  situation: string;
  profileId: string;
  factKey: string;
  label: string;
  value: string;
  verdict: "confirmed" | "rejected" | "missing";
  note?: string | undefined;
};
