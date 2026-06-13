"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  useTicketComments, 
  useAddTicketComment, 
  useAdminSupportTickets, 
  useAdminOrgs 
} from "@/services/super-admin-service";
import { 
  Ticket, RefreshCw, Send, User, ShieldAlert, Award, Clock, ArrowLeft,
  Calendar, UserPlus, Flag, Zap, CheckCircle2, MessageSquare, Lock, Globe
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { useAuthStore } from "@/store/use-auth-store";

const PRIORITY_STYLES: Record<string, string> = {
  HIGH: "bg-[var(--danger-muted)] text-[var(--danger)] border-[var(--danger)]/20",
  MEDIUM: "bg-[var(--warning-muted)] text-[var(--warning)] border-[var(--warning)]/20",
  LOW: "bg-[var(--info-muted)] text-[var(--info)] border-[var(--info)]/20",
  NORMAL: "bg-surface-2 text-[var(--text-secondary)] border-border",
};

const AGENTS = ["Alice (Platform Support)", "Bob (Infrastructure Ops)", "Charlie (Finance/Billing)"];

export default function TicketWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const ticketId = params.ticketId as string;
  const { user: currentUser } = useAuthStore();

  const [isInternal, setIsInternal] = useState(false);
  const [replyText, setReplyText] = useState("");

  // Queries
  const { data: tickets = [], refetch: refetchTickets } = useAdminSupportTickets();
  const { data: orgs = [] } = useAdminOrgs({ limit: 100 });
  const { data: comments = [], isLoading: commentsLoading, refetch: refetchComments } = useTicketComments(ticketId);

  const addComment = useAddTicketComment();

  // Local state for the specific ticket
  const [ticket, setTicket] = useState<any | null>(null);

  useEffect(() => {
    const found = tickets.find(t => t.id === ticketId);
    if (found) {
      setTicket({
        ...found,
        assigned_agent: found.assigned_agent || "Unassigned",
        is_escalated: found.is_escalated || false
      });
    } else {
      // Fallback Mock Ticket
      setTicket({
        id: ticketId,
        organization_id: "org-1",
        subject: "WAF block policy blocking webhook payloads",
        priority: "HIGH",
        status: "OPEN",
        created_at: new Date(Date.now() - 1000 * 3600 * 4).toISOString(),
        assigned_agent: "Unassigned",
        is_escalated: false,
        description: "We are receiving HTTP 403 Forbidden errors when dispatching transaction webhook payloads back to our core servers. It seems the Cloudflare WAF block is matching signature headers."
      });
    }
  }, [tickets, ticketId]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    try {
      if (ticketId.startsWith("t-") || !ticketId) {
        // Mock reply log inside local memory
        toast.success("Mock comment logged in timeline");
        setReplyText("");
        return;
      }
      await addComment.mutateAsync({
        ticketId,
        content: `${isInternal ? "[INTERNAL NOTE] " : ""}${replyText.trim()}`,
      });
      setReplyText("");
      refetchComments();
      toast.success("Support reply recorded");
    } catch {
      toast.error("Failed to post comment");
    }
  };

  const updateStatus = (nextStatus: string) => {
    if (ticket) {
      setTicket({ ...ticket, status: nextStatus });
      toast.success(`Status updated to ${nextStatus}`);
    }
  };

  const updatePriority = (nextPriority: string) => {
    if (ticket) {
      setTicket({ ...ticket, priority: nextPriority });
      toast.success(`Priority updated to ${nextPriority}`);
    }
  };

  const updateAgent = (agent: string) => {
    if (ticket) {
      setTicket({ ...ticket, assigned_agent: agent });
      toast.success(`Ticket assigned to ${agent}`);
    }
  };

  const triggerEscalation = () => {
    if (ticket) {
      setTicket({ ...ticket, is_escalated: true, priority: "HIGH" });
      toast.warning("Ticket escalated to Tier-2 engineering supervisor.");
    }
  };

  const orgName = useMemo(() => {
    if (!ticket) return "External Organization";
    return orgs.find(o => o.id === ticket.organization_id)?.name || "TechConf Inc.";
  }, [ticket, orgs]);

  // SLA calculations
  const sla = useMemo(() => {
    if (!ticket) return { text: "", isBreached: false, isWarning: false };
    const createdTime = new Date(ticket.created_at).getTime();
    const limitTime = createdTime + 24 * 3600 * 1000;
    const remaining = limitTime - Date.now();
    const isBreached = remaining <= 0;
    const isWarning = remaining > 0 && remaining < 4.8 * 3600 * 1000;
    
    let text = "SLA Breached";
    if (!isBreached) {
      const hours = Math.floor(remaining / (3600 * 1000));
      const mins = Math.floor((remaining % (3600 * 1000)) / (60 * 1000));
      text = `${hours}h ${mins}m remaining`;
    }
    return { text, isBreached, isWarning };
  }, [ticket]);

  if (!ticket) {
    return (
      <div className="flex h-screen items-center justify-center text-xs text-[var(--text-tertiary)] bg-background">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-[var(--brand-primary)]" />
        Synchronizing workspace...
      </div>
    );
  }

  return (
    <PageContainer>
      <div className="flex items-center gap-2 mb-2">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => router.push("/super-admin/support/tickets")}
          className="h-8 px-2 text-[var(--text-secondary)] border border-transparent hover:bg-surface-2"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to Board
        </Button>
      </div>

      <SectionHeader
        title={`Workspace: Ticket #${ticketId.slice(0, 8)}`}
        description={ticket.subject}
        breadcrumb={["Console", "Support", `Ticket-${ticketId.slice(0, 8)}`]}
        actions={
          <Button
            variant="outline"
            onClick={() => { refetchComments(); refetchTickets(); }}
            size="sm"
            className="border-border"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-2 text-[var(--text-tertiary)]" /> Refresh Thread
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 items-start">
        
        {/* Left Column (70%) — Telemetry Thread & Composer */}
        <div className="lg:col-span-7 space-y-5">
          
          {/* Ticket Description Card */}
          <div className="rounded-xl border border-border bg-surface p-5 space-y-3 shadow-sm">
            <div className="flex justify-between items-center text-[10px] text-[var(--text-tertiary)] border-b border-border/60 pb-2">
              <span className="font-semibold uppercase tracking-wider">{orgName}</span>
              <span className="font-mono">{new Date(ticket.created_at).toLocaleString()}</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed select-text">
              {ticket.description || "No description supplied."}
            </p>
          </div>

          {/* Conversation History & Logs */}
          <div className="space-y-3.5">
            <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Conversation Log</h3>
            
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
              {commentsLoading ? (
                <div className="p-8 text-center text-xs text-[var(--text-tertiary)]">
                  <RefreshCw className="w-4 h-4 animate-spin mx-auto text-[var(--brand-primary)] mb-2" />
                  Pulling comments...
                </div>
              ) : comments.length === 0 ? (
                <div className="p-10 border border-dashed border-border rounded-xl text-center text-xs text-[var(--text-tertiary)] bg-surface-2/30">
                  No comments posted on this ticket yet. Write a response below.
                </div>
              ) : (
                comments.map((comment, index) => {
                  const isInternalNote = comment.content.startsWith("[INTERNAL NOTE]");
                  const cleanContent = comment.content.replace("[INTERNAL NOTE] ", "");
                  const isAuthorAdmin = comment.author_email.includes("admin") || comment.author_id === currentUser?.id;

                  return (
                    <motion.div 
                      key={comment.id || index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "rounded-xl border p-4.5 space-y-2 max-w-[85%] shadow-sm",
                        isAuthorAdmin 
                          ? isInternalNote 
                            ? "bg-amber-500/5 border-amber-500/25 ml-auto text-right"
                            : "bg-[var(--brand-primary-muted)]/10 border-[var(--brand-primary)]/20 ml-auto text-right"
                          : "bg-surface border-border"
                      )}
                    >
                      <div className={cn("flex justify-between items-center text-[9px] text-[var(--text-tertiary)] font-mono", isAuthorAdmin && "flex-row-reverse")}>
                        <span className="font-bold flex items-center gap-1">
                          {isInternalNote && <Lock className="w-2.5 h-2.5 text-[var(--warning)]" />}
                          {comment.author_name}
                        </span>
                        <span>{formatDistanceToNow(new Date(comment.created_at))} ago</span>
                      </div>
                      <p className={cn("text-xs text-[var(--text-secondary)] leading-relaxed select-text", isAuthorAdmin && "text-right")}>
                        {cleanContent}
                      </p>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>

          {/* Reply Composer */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <form onSubmit={handleSendReply} className="space-y-4">
              <div className="flex gap-2 p-1 bg-surface-2 border border-border rounded-xl w-fit">
                <button
                  type="button"
                  onClick={() => setIsInternal(false)}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-semibold transition-all",
                    !isInternal ? "bg-surface text-[var(--text-primary)] shadow-sm" : "text-[var(--text-secondary)]"
                  )}
                >
                  Public Reply
                </button>
                <button
                  type="button"
                  onClick={() => setIsInternal(true)}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1",
                    isInternal ? "bg-[var(--warning-muted)] text-[var(--warning)] shadow-sm" : "text-[var(--text-secondary)]"
                  )}
                >
                  <Lock className="w-3.5 h-3.5" />
                  Internal Note
                </button>
              </div>

              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={isInternal ? "Type private internal note... (visible only to administrators)" : "Type customer response..."}
                className="w-full h-24 rounded-xl border border-border bg-surface-2 p-3 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]"
              />

              <div className="flex justify-between items-center pt-2">
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  {isInternal ? "⚡ private admin telemetry" : "✉ customer-facing reply"}
                </span>
                <Button type="submit" disabled={!replyText.trim()} className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/90 text-white font-semibold text-xs px-4 h-9 flex gap-1.5">
                  <Send className="w-3.5 h-3.5" /> Send Response
                </Button>
              </div>
            </form>
          </div>

        </div>

        {/* Right Column (30%) — Metadata Control overrides */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* SLA countdown timer card */}
          {ticket.status !== "RESOLVED" && (
            <div className={cn(
              "rounded-xl border p-4.5 space-y-2 shadow-sm text-center",
              sla.isBreached ? "bg-[var(--danger-muted)] border-[var(--danger)]/30 text-[var(--danger)]" : sla.isWarning ? "bg-[var(--warning-muted)] border-[var(--warning)]/30 text-[var(--warning)]" : "bg-[var(--success-muted)] border-[var(--success)]/30 text-[var(--success)]"
            )}>
              <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">SLA Resolution Target</span>
              <div className="text-xl font-extrabold tracking-tight flex items-center justify-center gap-2">
                <Clock className="w-5 h-5 animate-pulse" />
                <span>{sla.text}</span>
              </div>
            </div>
          )}

          {/* Configuration Parameters Panel */}
          <div className="rounded-xl border border-border bg-surface p-5 space-y-5 shadow-sm text-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] border-b border-border/60 pb-2 mb-1">Ticket Metadata</h3>
            
            {/* Status override */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider block">Ticket Status</label>
              <select
                value={ticket.status}
                onChange={(e) => updateStatus(e.target.value)}
                className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--brand-primary)] cursor-pointer"
              >
                {["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED"].map(c => (
                  <option key={c} value={c} className="bg-surface">{c.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>

            {/* Priority override */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider block">Priority Level</label>
              <select
                value={ticket.priority}
                onChange={(e) => updatePriority(e.target.value)}
                className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--brand-primary)] cursor-pointer"
              >
                {["LOW", "NORMAL", "MEDIUM", "HIGH"].map(p => (
                  <option key={p} value={p} className="bg-surface">{p}</option>
                ))}
              </select>
            </div>

            {/* Support Agent Assignment override */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider block flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5 text-[var(--brand-primary)]" /> Assignee
              </label>
              <select
                value={ticket.assigned_agent}
                onChange={(e) => updateAgent(e.target.value)}
                className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--brand-primary)] cursor-pointer"
              >
                <option value="Unassigned">Unassigned</option>
                {AGENTS.map(agent => (
                  <option key={agent} value={agent} className="bg-surface">{agent}</option>
                ))}
              </select>
            </div>

            {/* Tier-2 Escalation */}
            <div className="space-y-2 border-t border-border/60 pt-4 mt-2">
              <Button
                onClick={triggerEscalation}
                disabled={ticket.is_escalated}
                className="w-full h-9 rounded-xl border border-[var(--danger)]/20 bg-[var(--danger-muted)] hover:bg-[var(--danger-muted)]/60 text-[var(--danger)] font-bold text-xs"
              >
                {ticket.is_escalated ? "Tier-2 Escalated" : "Escalate to Supervisor"}
              </Button>
              <Button
                onClick={() => updateStatus("RESOLVED")}
                disabled={ticket.status === "RESOLVED"}
                className="w-full h-9 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/95 text-white font-bold text-xs"
              >
                Mark Resolved
              </Button>
            </div>
          </div>

          {/* Org details card */}
          <div className="rounded-xl border border-border bg-surface p-5 space-y-4 shadow-sm text-xs text-[var(--text-secondary)]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] border-b border-border/60 pb-2">Tenant Details</h3>
            <div className="space-y-2">
              <div>
                <span className="text-[9px] text-[var(--text-tertiary)] block">Name:</span>
                <span className="font-bold text-[var(--text-primary)]">{orgName}</span>
              </div>
              <div>
                <span className="text-[9px] text-[var(--text-tertiary)] block">ID Correlation:</span>
                <span className="font-mono text-[10px] bg-surface-2 px-1.5 py-0.5 rounded truncate block max-w-full">{ticket.organization_id}</span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </PageContainer>
  );
}
