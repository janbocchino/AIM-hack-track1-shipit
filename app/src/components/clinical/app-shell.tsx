import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { FlaskConical, MessageSquare, Plus, Stethoscope, Trash2 } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { createThread, deleteThread, ensureThread, useStore } from "@/lib/clinical/store";
import { warmupContradictions } from "@/lib/clinical/clinical.functions";
import { SourceProvider } from "./source-panel";

let warmed = false;
const OPEN_KEY = "cts.sidebar.open";

export function AppShell({ activeId, header, children }: { activeId?: string | undefined; header?: ReactNode | undefined; children: ReactNode }) {
  const { threads, lessons } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(localStorage.getItem(OPEN_KEY) === "1");
    if (!warmed) { warmed = true; warmupContradictions().catch(() => {}); }
  }, []);
  const sorted = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <SourceProvider>
      <SidebarProvider
        open={open}
        onOpenChange={(o) => { setOpen(o); localStorage.setItem(OPEN_KEY, o ? "1" : "0"); }}
        className="h-dvh min-h-0"
      >
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Clinical Task Screen">
                  <Link to="/">
                    <span className="-my-2 -ml-2 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <Stethoscope className="size-4" />
                    </span>
                    <span className="font-semibold">Clinical Task Screen</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="New chat" onClick={() => navigate({ to: "/chat/$threadId", params: { threadId: createThread() } })}>
                  <Plus /><span>New chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup className="group-data-[collapsible=icon]:hidden">
              <SidebarGroupLabel>Chats</SidebarGroupLabel>
              <SidebarMenu>
                {sorted.map((t) => (
                  <SidebarMenuItem key={t.id}>
                    <SidebarMenuButton asChild isActive={t.id === activeId}>
                      <Link to="/chat/$threadId" params={{ threadId: t.id }}><span>{t.title}</span></Link>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      showOnHover
                      aria-label="Delete chat"
                      onClick={() => {
                        deleteThread(t.id);
                        if (t.id === activeId) navigate({ to: "/chat/$threadId", params: { threadId: ensureThread() } });
                      }}
                    >
                      <Trash2 />
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
            <SidebarGroup className="hidden group-data-[collapsible=icon]:block">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Chats" onClick={() => setOpen(true)}><MessageSquare /><span>Chats</span></SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Evaluation & learning">
                  <Link to="/eval"><FlaskConical /><span>Evaluation & learning</span></Link>
                </SidebarMenuButton>
                <SidebarMenuBadge>{lessons.length}</SidebarMenuBadge>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
            <SidebarTrigger />
            <div className="flex min-w-0 flex-1 items-center gap-2">{header}</div>
          </div>
          {children}
        </main>
      </SidebarProvider>
    </SourceProvider>
  );
}
