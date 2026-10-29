import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ensureThread } from "@/lib/clinical/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Clinical Task Screen — facts for your role and task" },
      { name: "description", content: "Enter your role and task and get one screen with the patient facts you need, each linked to its source." },
      { property: "og:title", content: "Clinical Task Screen" },
      { property: "og:description", content: "Role- and task-specific patient facts with source links, contradictions and verification." },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    // ensureThread is idempotent: reuses the newest chat or creates exactly one.
    navigate({ to: "/chat/$threadId", params: { threadId: ensureThread() }, replace: true });
  }, [navigate]);
  return <div className="h-dvh bg-background" />;
}
