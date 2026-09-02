"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  GripHorizontal,
  Hash,
  MessageSquare,
  Minus,
  Radio,
  Send,
  Volume2,
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const CHANNELS = [
  { id: "technical-support", name: "tech-support", desc: "Stage & hall technical cues" },
  { id: "rooms", name: "rooms", desc: "Session starts, overflows & cues" },
  { id: "srr", name: "srr", desc: "Speaker Ready Room check-ins" },
  { id: "registration", name: "registration", desc: "Badge printing & queues" },
  { id: "signage", name: "signage", desc: "Digital signage announcements" },
  { id: "announcements", name: "announcements", desc: "Venue-wide lead broadcast" },
];

export function FloatingChatOverlay() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [activeChannel, setActiveChannel] = useState("technical-support");
  const [messageText, setMessageText] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [windowSize, setWindowSize] = useState<{ width: number; height: number }>({ width: 1280, height: 800 });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Measure window dimensions for boundary constraints
  useEffect(() => {
    const updateSize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const cardWidth = isOpen ? 390 : 210;
  const cardHeight = isOpen ? 520 : 48;

  const dragConstraints = {
    left: -(windowSize.width - cardWidth - 48),
    right: 0,
    top: -(windowSize.height - cardHeight - 48),
    bottom: 0,
  };

  // Chat Query
  const { data } = useQuery({
    queryKey: ["floating-chat-messages", activeChannel],
    queryFn: () => apiClient.get<any>(`/venue/admin/control/chat/messages?channel=${activeChannel}`),
    refetchInterval: 3000,
  });

  const messages: any[] = data?.messages || [];

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, isOpen]);

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
      queryClient.invalidateQueries({ queryKey: ["floating-chat-messages", activeChannel] });
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (messageText.trim() && !sendMutation.isPending) {
      sendMutation.mutate(messageText.trim());
    }
  };

  // Unconditionally evaluate all hooks above, then hide on full chat page
  if (pathname === "/dashboard/communication/chat") {
    return null;
  }

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0.04}
      dragConstraints={dragConstraints}
      className="fixed bottom-6 right-6 z-50 select-none"
    >
      <AnimatePresence mode="wait">
        {!isOpen ? (
          /* Minimized Floating Pill (Themed) */
          <motion.div
            key="minimized-pill"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-[var(--text)] shadow-2xl cursor-grab active:cursor-grabbing hover:border-[var(--acc)] transition-colors"
          >
            <GripHorizontal className="size-3.5 text-[var(--muted)] opacity-60" />
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[var(--text)]"
            >
              <div className="relative flex size-6 items-center justify-center rounded-full bg-[var(--acc)]/20 text-[var(--acc)] font-bold">
                <MessageSquare className="size-3.5" />
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <span>Chat</span>
              <span className="rounded-full bg-[var(--surf)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted)] border border-[var(--border)]">
                #{activeChannel}
              </span>
            </button>
          </motion.div>
        ) : (
          /* Expanded Theme-Adaptive Solid Window */
          <motion.div
            key="expanded-window"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex h-[520px] w-[390px] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] shadow-2xl"
          >
            {/* Draggable Header (Themed) */}
            <div className="flex cursor-grab items-center justify-between border-b border-[var(--border)] bg-[var(--surf)] px-3.5 py-2.5 active:cursor-grabbing">
              <div className="flex items-center gap-2">
                <GripHorizontal className="size-3.5 text-[var(--muted)]" />
                <div className="flex items-center gap-1.5">
                  <Radio className="size-3.5 text-emerald-400 animate-pulse" />
                  <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                    Live Venue Intercom
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsMuted(!isMuted)}
                  title={isMuted ? "Unmute Alerts" : "Mute Alerts"}
                  className="grid size-6 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--raised)] hover:text-[var(--text)] transition-colors"
                >
                  <Volume2 className={cn("size-3.5", isMuted && "opacity-30 line-through")} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  title="Minimize Comms"
                  className="grid size-6 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--raised)] hover:text-[var(--text)] transition-colors"
                >
                  <Minus className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Channel Ribbon (Themed) */}
            <div className="no-scrollbar flex items-center gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--surf)]/70 px-2.5 py-1.5">
              {CHANNELS.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setActiveChannel(ch.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all",
                    activeChannel === ch.id
                      ? "tab-active shadow-xs font-black"
                      : "text-[var(--muted)] hover:bg-[var(--raised)] hover:text-[var(--text)]"
                  )}
                >
                  <Hash className="size-3 opacity-70" />
                  <span>{ch.name}</span>
                </button>
              ))}
            </div>

            {/* Message Stream (Themed) */}
            <div className="flex-1 overflow-y-auto bg-[var(--base)] p-3 space-y-2.5">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center p-4">
                  <div className="grid size-12 place-items-center rounded-2xl bg-[var(--surf)] border border-[var(--border)] text-[var(--muted)] mb-2">
                    <MessageSquare className="size-6" />
                  </div>
                  <p className="text-xs font-bold text-[var(--text)]">No messages in #{activeChannel}</p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">
                    Broadcast operational alerts, cues, or technical updates.
                  </p>
                </div>
              ) : (
                messages.map((m: any) => (
                  <div
                    key={m.id}
                    className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5 text-xs shadow-xs"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-[var(--text)]">{m.sender_name || "Operator"}</span>
                        <span className="rounded bg-[var(--raised)] px-1 py-0.2 text-[9px] font-mono uppercase text-[var(--acc)] font-semibold border border-[var(--border)]">
                          {m.sender_role || "Staff"}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-[var(--muted)]">
                        {m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                      </span>
                    </div>
                    <p className="text-[12px] text-[var(--text)] whitespace-pre-wrap leading-relaxed">{m.message}</p>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Footer (Themed) */}
            <form onSubmit={handleSend} className="border-t border-[var(--border)] bg-[var(--surf)] p-2.5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder={`Message #${activeChannel}...`}
                  className="h-9 flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--acc)]"
                />
                <button
                  type="submit"
                  disabled={!messageText.trim() || sendMutation.isPending}
                  className="grid size-9 place-items-center rounded-xl bg-[var(--acc)] text-[var(--acc-fg,#000)] font-bold transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
                >
                  <Send className="size-4" />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
