"use client";

import { Bell, BellOff, CheckCheck, Radio } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useWebSocket } from "@/hooks/useWebSocket";

interface OperationalNotification {
  id: string;
  title: string;
  message: string;
  receivedAt: string;
  read: boolean;
}

function normalizeNotification(payload: unknown): OperationalNotification {
  const value = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const receivedAt = new Date().toISOString();
  return {
    id: typeof value.id === "string" ? value.id : `${receivedAt}-${Math.random().toString(36).slice(2)}`,
    title: typeof value.title === "string" ? value.title : "Operational notification",
    message: typeof value.message === "string" ? value.message : "A platform event was received.",
    receivedAt,
    read: false,
  };
}

export function NotificationCenter() {
  const { socket, isConnected } = useWebSocket();
  const [items, setItems] = useState<OperationalNotification[]>([]);
  const unread = items.filter((item) => !item.read).length;

  useEffect(() => {
    if (!socket) return;
    const handleNotification = (payload: unknown) => {
      setItems((current) => [normalizeNotification(payload), ...current].slice(0, 50));
    };
    socket.on("notification", handleNotification);
    return () => { socket.off("notification", handleNotification); };
  }, [socket]);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative grid size-9 place-items-center rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <Bell aria-hidden className="size-4" />
          {unread > 0 && <span className="absolute right-1 top-1 min-w-3 rounded-full bg-[var(--status-danger)] px-1 text-[8px] font-bold leading-3 text-white">{Math.min(unread, 9)}</span>}
        </button>
      </SheetTrigger>
      <SheetContent aria-describedby={undefined} className="sm:max-w-md">
        <div className="border-b border-[var(--border-subtle)] p-5 pr-14">
          <SheetHeader>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
              <Radio aria-hidden className={isConnected ? "size-3 text-[var(--status-success)]" : "size-3 text-[var(--status-warning)]"} />
              {isConnected ? "Live channel connected" : "Live channel unavailable"}
            </div>
            <SheetTitle>Operational notifications</SheetTitle>
            <SheetDescription>Authenticated real-time platform events received during this session.</SheetDescription>
          </SheetHeader>
        </div>
        <div className="cc-scroll-region flex-1 overflow-y-auto p-4" aria-live="polite">
          {!items.length ? (
            <div className="flex min-h-80 flex-col items-center justify-center text-center">
              <span className="grid size-12 place-items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)]">
                {isConnected ? <Bell aria-hidden className="size-5" /> : <BellOff aria-hidden className="size-5" />}
              </span>
              <h2 className="mt-4 text-sm font-semibold">No session notifications</h2>
              <p className="mt-2 max-w-xs text-xs leading-5 text-[var(--text-secondary)]">
                {isConnected ? "New authenticated operational events will appear here." : "The real-time channel is unavailable. Critical status pages remain accessible through normal API requests."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => setItems((current) => current.map((item) => ({ ...item, read: true })))}>
                  <CheckCheck aria-hidden className="mr-2 size-3.5" />Mark all read
                </Button>
              </div>
              {items.map((item) => (
                <article key={item.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4">
                  <div className="flex items-start gap-3">
                    <span className={item.read ? "mt-1.5 size-2 rounded-full bg-[var(--text-disabled)]" : "mt-1.5 size-2 rounded-full bg-[var(--status-info)]"} />
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">{item.title}</h3>
                      <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{item.message}</p>
                      <time className="mt-2 block font-mono text-[10px] text-[var(--text-tertiary)]" dateTime={item.receivedAt}>{new Date(item.receivedAt).toLocaleTimeString()}</time>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
