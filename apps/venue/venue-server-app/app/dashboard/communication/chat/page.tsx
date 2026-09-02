"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DoorOpen,
  Hash,
  MessageSquare,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const OPERATIONAL_CHANNELS = [
  { id: "technical-support", name: "tech-support", desc: "Stage & hall technical cues and stage manager audio" },
  { id: "rooms", name: "rooms", desc: "Session starts, overflows & cues across presentation halls" },
  { id: "srr", name: "srr", desc: "Speaker Ready Room check-ins and slide verification" },
  { id: "registration", name: "registration", desc: "Badge printing, queue thresholds & counter allocations" },
  { id: "signage", name: "signage", desc: "Digital signage announcements & emergency screen takeovers" },
  { id: "announcements", name: "announcements", desc: "Venue-wide lead broadcast and executive announcements" },
];

export default function ChatWorkspacePage() {
  const queryClient = useQueryClient();
  const [activeChannel, setActiveChannel] = useState("technical-support");
  const [messageText, setMessageText] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Query Chat Messages
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["chat-messages-full", activeChannel],
    queryFn: () => apiClient.get<any>(`/venue/admin/control/chat/messages?channel=${activeChannel}`),
    refetchInterval: 3000,
  });

  const messages: any[] = data?.messages || [];

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Send Mutation
  const sendMutation = useMutation({
    mutationFn: (msg: string) =>
      apiClient.post("/venue/admin/control/chat/messages", {
        channel: activeChannel,
        message: msg,
        metadata_context: { timestamp: new Date().toISOString() },
      }),
    onSuccess: () => {
      setMessageText("");
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to send message");
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (messageText.trim() && !sendMutation.isPending) {
      sendMutation.mutate(messageText.trim());
    }
  };

  const activeChannelMeta = OPERATIONAL_CHANNELS.find((c) => c.id === activeChannel) || {
    id: activeChannel,
    name: activeChannel,
    desc: "Operational broadcast channel",
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-8.5rem)] w-full max-w-[1720px] flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="size-4 text-emerald-400 animate-pulse" />
            <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--acc)]">
              COMMUNICATION · REAL-TIME INTERCOM & CUES
            </span>
          </div>
          <h1 className="text-xl font-black uppercase tracking-tight text-[var(--text)] sm:text-2xl">
            Operational Chat & Comms
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold transition-all",
              soundEnabled ? "text-emerald-400" : "text-[var(--muted)]"
            )}
          >
            {soundEnabled ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
            <span>{soundEnabled ? "Alert Sound ON" : "Muted"}</span>
          </button>

          <button
            onClick={() => refetch()}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-bold text-[var(--muted)] hover:text-[var(--text)]"
          >
            <RefreshCw className="size-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Chat Split: Channels (Left) + Messages (Right) */}
      <div className="flex flex-1 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        {/* Left: Channels Sidebar */}
        <div className="w-72 border-r border-[var(--border)] bg-[var(--surf)] p-3 space-y-1 overflow-y-auto">
          <span className="px-2 font-mono text-[9px] font-black uppercase tracking-wider text-[var(--muted)]">
            OPERATIONAL CHANNELS
          </span>

          <div className="mt-2 space-y-1">
            {OPERATIONAL_CHANNELS.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setActiveChannel(ch.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold transition-all",
                  activeChannel === ch.id
                    ? "tab-active shadow-sm"
                    : "text-[var(--muted)] hover:bg-[var(--raised)] hover:text-[var(--text)]"
                )}
              >
                <div className="flex items-center gap-2 truncate">
                  <Hash className="size-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{ch.name}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-6 border-t border-[var(--border)] pt-3 space-y-1">
            <span className="px-2 font-mono text-[9px] font-black uppercase tracking-wider text-[var(--muted)]">
              DIRECT ROOM CHANNELS
            </span>
            <div className="mt-1 space-y-1">
              {["hall-a", "hall-b", "hall-c", "workshop-1"].map((room) => (
                <button
                  key={room}
                  onClick={() => setActiveChannel(room)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-xs font-medium transition-all",
                    activeChannel === room
                      ? "tab-active shadow-sm font-bold"
                      : "text-[var(--muted)] hover:bg-[var(--raised)] hover:text-[var(--text)]"
                  )}
                >
                  <DoorOpen className="size-3.5 opacity-60" />
                  <span className="truncate capitalize">{room.replace("-", " ")}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Active Message View */}
        <div className="flex flex-1 flex-col overflow-hidden bg-[var(--base)]">
          {/* Channel Info Bar */}
          <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surf)] px-5 py-3">
            <div className="flex items-center gap-2">
              <Hash className="size-4 text-[var(--acc)]" />
              <div>
                <h2 className="text-sm font-black uppercase tracking-wide text-[var(--text)]">
                  {activeChannelMeta.name}
                </h2>
                <p className="text-[11px] text-[var(--muted)]">{activeChannelMeta.desc}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 font-mono text-xs text-[var(--muted)]">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Real-Time Stream Active</span>
            </div>
          </div>

          {/* Message List */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {isLoading ? (
              <div className="flex h-full items-center justify-center text-xs text-[var(--muted)]">
                Loading messages...
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center p-6">
                <div className="grid size-14 place-items-center rounded-2xl bg-[var(--surf)] border border-[var(--border)] text-[var(--muted)] mb-3">
                  <MessageSquare className="size-7" />
                </div>
                <h3 className="text-sm font-bold text-[var(--text)]">Channel #{activeChannelMeta.name} is quiet</h3>
                <p className="mt-1 text-xs text-[var(--muted)] max-w-sm">
                  Send technical cues, stage requests, or status updates to all operators listening on this channel.
                </p>
              </div>
            ) : (
              messages.map((m: any) => (
                <div
                  key={m.id}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-xs transition-all hover:border-[var(--acc)]/30"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-[var(--text)]">{m.sender_name || "Operator"}</span>
                      <span className="rounded-md bg-[var(--raised)] px-1.5 py-0.5 font-mono text-[9px] uppercase font-bold text-[var(--acc)] border border-[var(--border)]">
                        {m.sender_role || "Staff"}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-[var(--muted)]">
                      {m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text)] whitespace-pre-wrap leading-relaxed">{m.message}</p>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSend} className="border-t border-[var(--border)] bg-[var(--surf)] p-3.5">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder={`Broadcast to #${activeChannelMeta.name}...`}
                className="h-10 flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 text-xs text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--acc)]"
              />
              <button
                type="submit"
                disabled={!messageText.trim() || sendMutation.isPending}
                className="flex h-10 items-center gap-2 rounded-xl bg-[var(--acc)] px-5 text-xs font-bold text-[var(--acc-fg,#000)] transition-transform hover:opacity-90 active:scale-95 disabled:opacity-40"
              >
                <Send className="size-4" />
                <span>Send Cue</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
