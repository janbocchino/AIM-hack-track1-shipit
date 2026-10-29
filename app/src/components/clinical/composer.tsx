import { useEffect, useRef, useState } from "react";
import { Headphones, Mic, Square } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { startDictation } from "@/lib/voice/dictation";
import { cn } from "@/lib/utils";

export function Composer({ threadId, busy, onSend }: { threadId: string; busy: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const [rec, setRec] = useState<null | Awaited<ReturnType<typeof startDictation>>>(null);
  const [transcribing, setTranscribing] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!busy) ref.current?.focus();
  }, [busy, threadId]);

  const toggleMic = async () => {
    if (rec) {
      setRec(null);
      setTranscribing(true);
      try {
        const base = text ? `${text} ` : "";
        const out = await rec.stop((partial) => setText(base + partial));
        setText(base + out);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setTranscribing(false);
        ref.current?.focus();
      }
      return;
    }
    try {
      setRec(await startDictation());
    } catch {
      toast.error("Microphone not available. Please allow microphone access.");
    }
  };

  return (
    <PromptInput
      onSubmit={(m) => {
        const t = m.text.trim();
        if (!t || busy) return;
        onSend(t);
        setText("");
      }}
      className="rounded-xl border bg-background shadow-sm"
    >
      <PromptInputBody>
        <PromptInputTextarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={rec ? "Listening… tap the square to stop" : transcribing ? "Transcribing…" : "Your role and task, or a question about the patient…"}
        />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools>
          <Link
            to="/voice/$threadId"
            params={{ threadId }}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:border-foreground"
          >
            <Headphones className="size-3.5" /> Hands-free mode
          </Link>
        </PromptInputTools>
        <div className="flex items-center gap-1">
          <PromptInputButton
            onClick={toggleMic}
            aria-label={rec ? "Stop dictation" : "Dictate"}
            disabled={transcribing}
            className={cn(rec && "animate-pulse text-conflict")}
          >
            {rec ? <Square className="size-4 fill-current" /> : <Mic className="size-4" />}
          </PromptInputButton>
          <PromptInputSubmit {...(busy ? { status: "submitted" as const } : {})} disabled={!text.trim() || busy} />
        </div>
      </PromptInputFooter>
    </PromptInput>
  );
}
