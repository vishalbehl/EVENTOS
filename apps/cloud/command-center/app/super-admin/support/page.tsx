"use client";

import { useState } from "react";
import {
  useAdminSupportTickets,
  useTicketComments,
  useAddTicketComment,
  useAdminOrgs
} from "@/services/super-admin-service";
import {
  Ticket, Search, RefreshCw, AlertCircle, CheckCircle2,
  Clock, Play, Send, User, ChevronRight, X
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useAuthStore } from "@/store/use-auth-store";

const PRIORITY_STYLES: Record<string, string> = {
  HIGH: "bg-red-500/10 text-red-400 border-red-500/20",
  MEDIUM: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  LOW: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  NORMAL: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  IN_PROGRESS: "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse",
  CLOSED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

export default function SupportCenterPage() {
  const { user: currentUser } = useAuthStore();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  const { data: tickets = [], isLoading: ticketsLoading, refetch: refetchTickets } = useAdminSupportTickets();
  const { data: orgs = [] } = useAdminOrgs({ limit: 200 });
  const { data: comments = [], isLoading: commentsLoading } = useTicketComments(selectedTicketId || "");

  const addCommentMutation = useAddTicketComment();

  const activeTicket = tickets.find((t) => t.id === selectedTicketId);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketId || !replyText.trim()) return;

    try {
      await addCommentMutation.mutateAsync({
        ticketId: selectedTicketId,
        content: replyText.trim(),
      });
      setReplyText("");
      toast.success("Response sent successfully");
    } catch (err: any) {
      toast.error(err?.message || "Failed to send response");
    }
  };

  const getOrgName = (orgId: string) => {
    return orgs.find((o) => o.id === orgId)?.name || orgId.slice(0, 8);
  };

  const filteredTickets = tickets.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (priorityFilter && t.priority !== priorityFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-1 gap-6 min-h-0 overflow-hidden animate-in fade-in duration-500">
      {/* Sidebar/List Panel */}
      <div className={`flex flex-col flex-1 min-w-0 h-full space-y-4 ${selectedTicketId ? "hidden lg:flex lg:max-w-md" : ""}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
              <Ticket className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white">Support Desk</h1>
              <p className="text-[11px] text-white/35">Manage customer support requests and SLAs</p>
            </div>
          </div>
          <button
            onClick={() => refetchTickets()}
            className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white/40 hover:text-white"
          >
            <RefreshCw className={`w-4 h-4 ${ticketsLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold text-white/60 uppercase tracking-wider focus:outline-none focus:border-indigo-500/40"
          >
            <option value="" className="bg-[var(--surf)]">All Statuses</option>
            <option value="OPEN" className="bg-[var(--surf)]">Open</option>
            <option value="IN_PROGRESS" className="bg-[var(--surf)]">In Progress</option>
            <option value="CLOSED" className="bg-[var(--surf)]">Closed</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold text-white/60 uppercase tracking-wider focus:outline-none focus:border-indigo-500/40"
          >
            <option value="" className="bg-[var(--surf)]">All Priorities</option>
            <option value="HIGH" className="bg-[var(--surf)]">High</option>
            <option value="MEDIUM" className="bg-[var(--surf)]">Medium</option>
            <option value="LOW" className="bg-[var(--surf)]">Low</option>
            <option value="NORMAL" className="bg-[var(--surf)]">Normal</option>
          </select>
        </div>

        {/* Ticket List */}
        <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/5 bg-white/3 divide-y divide-white/3 custom-scrollbar">
          {ticketsLoading ? (
            <div className="p-8 flex items-center gap-2 text-white/25 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading ticket queue…
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="p-12 text-center text-white/20 text-sm">
              <AlertCircle className="w-8 h-8 text-white/10 mx-auto mb-3" />
              No support tickets found.
            </div>
          ) : (
            filteredTickets.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTicketId(t.id)}
                className={`w-full text-left p-4 hover:bg-white/5 transition-colors flex items-center justify-between gap-4 ${
                  selectedTicketId === t.id ? "bg-white/5 border-l-2 border-indigo-500" : ""
                }`}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${PRIORITY_STYLES[t.priority] || PRIORITY_STYLES.NORMAL}`}>
                      {t.priority}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${STATUS_STYLES[t.status] || STATUS_STYLES.OPEN}`}>
                      {t.status.replace("_", " ")}
                    </span>
                  </div>
                  <h3 className="text-xs font-black text-white/85 truncate">{t.subject}</h3>
                  <div className="flex items-center gap-1.5 text-[9px] text-white/30 font-medium">
                    <span className="truncate">{getOrgName(t.organization_id)}</span>
                    <span>•</span>
                    <span className="font-mono">{formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/20" />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Active Conversation Detail Panel */}
      <div className={`flex flex-col flex-1 h-full min-w-0 rounded-2xl border border-white/5 bg-white/3 overflow-hidden ${!selectedTicketId ? "hidden lg:flex items-center justify-center p-8 text-white/25 text-sm" : ""}`}>
        {selectedTicketId && activeTicket ? (
          <>
            {/* Conversation Header */}
            <div className="px-5 py-4 border-b border-white/5 bg-white/3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-black text-white">{activeTicket.subject}</h2>
                  <button
                    onClick={() => setSelectedTicketId(null)}
                    className="lg:hidden p-1 rounded-md hover:bg-white/5 text-white/40 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-white/30 mt-1">
                  <span className="font-bold text-white/50">{getOrgName(activeTicket.organization_id)}</span>
                  <span>•</span>
                  <span>ID: {activeTicket.id.slice(0, 12)}…</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border ${STATUS_STYLES[activeTicket.status] || STATUS_STYLES.OPEN}`}>
                  {activeTicket.status.replace("_", " ")}
                </span>
              </div>
            </div>

            {/* Conversation Flow */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 custom-scrollbar">
              {commentsLoading ? (
                <div className="flex items-center justify-center h-full text-white/20 text-sm">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading messages…
                </div>
              ) : comments.length === 0 ? (
                <div className="flex items-center justify-center h-full text-white/20 text-sm">
                  No message history found for this ticket.
                </div>
              ) : (
                comments.map((comment) => {
                  const isAdminReply = comment.author_id === currentUser?.id || comment.author_email.includes("admin");
                  return (
                    <div
                      key={comment.id}
                      className={`flex gap-3 max-w-[85%] ${isAdminReply ? "ml-auto flex-row-reverse" : "mr-auto"}`}
                    >
                      <div className={`w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/5 shrink-0 ${
                        isAdminReply ? "border-purple-500/20 text-purple-400 bg-purple-500/5" : "text-indigo-400 bg-indigo-500/5"
                      }`}>
                        <User className="w-4 h-4" />
                      </div>
                      <div className="space-y-1">
                        <div className={`flex items-center gap-2 text-[9px] text-white/35 ${isAdminReply ? "justify-end" : ""}`}>
                          <span className="font-bold">{comment.author_name}</span>
                          <span>•</span>
                          <span className="font-mono">{formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}</span>
                        </div>
                        <div className={`p-3.5 rounded-2xl text-[12px] leading-relaxed ${
                          isAdminReply
                            ? "bg-purple-600 text-white rounded-tr-none shadow-lg shadow-purple-600/15"
                            : "bg-white/5 border border-white/5 text-white/80 rounded-tl-none"
                        }`}>
                          {comment.content}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Reply Composer */}
            <form onSubmit={handleSendReply} className="p-4 border-t border-white/5 bg-white/3 flex gap-2">
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your reply to customer…"
                disabled={addCommentMutation.isPending}
                className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/40"
              />
              <button
                type="submit"
                disabled={addCommentMutation.isPending || !replyText.trim()}
                className="p-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 text-white transition-all shadow-lg shadow-indigo-500/10 flex items-center justify-center shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </>
        ) : (
          <div className="text-center space-y-2">
            <Ticket className="w-12 h-12 text-white/5 mx-auto animate-pulse" />
            <p className="text-white/25 text-xs">Select a support ticket from the queue to view conversation</p>
          </div>
        )}
      </div>
    </div>
  );
}
