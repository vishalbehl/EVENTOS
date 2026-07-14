"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  useAdminSupportTickets, 
  useAdminOrgs 
} from "@/services/super-admin-service";
import { 
  Ticket, Search, RefreshCw, Clock, ChevronRight, UserPlus, Sparkles, BarChart2 
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { MetricRow } from "@/components/super-admin/ui/MetricRow";

const COLUMNS = ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED"];

const PRIORITY_STYLES: Record<string, string> = {
  HIGH: "bg-[var(--danger-muted)] text-[var(--danger)] border-[var(--danger)]/20",
  MEDIUM: "bg-[var(--warning-muted)] text-[var(--warning)] border-[var(--warning)]/20",
  LOW: "bg-[var(--info-muted)] text-[var(--info)] border-[var(--info)]/20",
  NORMAL: "bg-surface-2 text-[var(--text-secondary)] border-border",
};

export default function SupportKanbanPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  // Queries
  const { data: tickets = [], isLoading: ticketsLoading, refetch: refetchTickets } = useAdminSupportTickets();
  const { data: orgs = [] } = useAdminOrgs({ limit: 100 });

  // Local state for tickets (including mock ones if none exist in db)
  const [localTickets, setLocalTickets] = useState<any[]>([]);

  useEffect(() => {
    if (tickets.length > 0) {
      setLocalTickets(tickets.map(t => ({
        ...t,
        assigned_agent: t.assigned_agent || "Unassigned",
        is_escalated: t.is_escalated || false
      })));
    } else {
      // Mock seed tickets
      setLocalTickets([
        {
          id: "t-101",
          organization_id: "org-1",
          subject: "WAF block policy blocking webhook payloads",
          priority: "HIGH",
          status: "OPEN",
          created_at: new Date(Date.now() - 1000 * 3600 * 4).toISOString(),
          assigned_agent: "Unassigned",
          is_escalated: false,
          description: "We are receiving HTTP 403 Forbidden errors when dispatching transaction webhook payloads back to our core servers."
        },
        {
          id: "t-102",
          organization_id: "org-2",
          subject: "Subscription tier limits migration request",
          priority: "MEDIUM",
          status: "IN_PROGRESS",
          created_at: new Date(Date.now() - 1000 * 3600 * 18).toISOString(),
          assigned_agent: "Alice (Platform Support)",
          is_escalated: false,
          description: "We recently requested a trial extension to verify custom registration pipelines."
        },
        {
          id: "t-103",
          organization_id: "org-3",
          subject: "Stripe recurring invoice payment dispute",
          priority: "HIGH",
          status: "WAITING_ON_CUSTOMER",
          created_at: new Date(Date.now() - 1000 * 3600 * 25).toISOString(),
          assigned_agent: "Charlie (Finance/Billing)",
          is_escalated: true,
          description: "Our invoice INV-0349 was marked paid offline, but we still received an automated invoice reminder."
        },
        {
          id: "t-104",
          organization_id: "org-4",
          subject: "Index rebuild timeout alert",
          priority: "LOW",
          status: "RESOLVED",
          created_at: new Date(Date.now() - 1000 * 3600 * 2).toISOString(),
          assigned_agent: "Bob (Infrastructure Ops)",
          is_escalated: false,
          description: "Elasticsearch index failed to complete task due to socket timeout."
        }
      ]);
    }
  }, [tickets]);

  // SLA calculations
  const getSLADetails = (createdAtStr: string) => {
    const createdTime = new Date(createdAtStr).getTime();
    const limitTime = createdTime + 24 * 3600 * 1000;
    const remaining = limitTime - Date.now();
    
    const isBreached = remaining <= 0;
    const isWarning = remaining > 0 && remaining < 4.8 * 3600 * 1000;
    
    let text = "SLA Breached";
    if (!isBreached) {
      const hours = Math.floor(remaining / (3600 * 1000));
      const mins = Math.floor((remaining % (3600 * 1000)) / (60 * 1000));
      text = `${hours}h ${mins}m left`;
    }

    return { text, isBreached, isWarning };
  };

  const getOrgName = (orgId: string) => {
    return orgs.find(o => o.id === orgId)?.name || "External Conference Organization";
  };

  const filteredTickets = useMemo(() => {
    return localTickets.filter(t => 
      searchQuery === "" || 
      t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [localTickets, searchQuery]);

  const metrics = [
    { label: "Open Tickets", value: localTickets.filter(t => t.status === "OPEN").length.toString(), icon: Ticket },
    { label: "Active Escalations", value: localTickets.filter(t => t.is_escalated).length.toString(), icon: Sparkles },
    { label: "Average SLA Compliance", value: "98.4%", icon: BarChart2 }
  ];

  return (
    <PageContainer>
      <SectionHeader
        title="Support Tickets Board"
        description="Brokering service-level compliance agreements and managing customer helpdesk tickets."
        breadcrumb={["Console", "Support", "Kanban"]}
        actions={
          <div className="flex gap-2">
            <div className="relative max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ticket subject..."
                className="rounded-xl bg-surface border border-border pl-9 pr-4 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--brand-primary)]"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => refetchTickets()}
              size="sm"
              className="border-border"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-[var(--text-tertiary)]", ticketsLoading && "animate-spin")} />
            </Button>
          </div>
        }
      />

      <MetricRow metrics={metrics} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start min-h-[500px]">
        {COLUMNS.map(col => {
          const colTickets = filteredTickets.filter(t => t.status === col);
          return (
            <div key={col} className="rounded-xl border border-border bg-surface p-4.5 flex flex-col min-h-[450px]">
              <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  {col.replace(/_/g, " ")}
                </span>
                <Badge variant="secondary" className="text-[9px] py-0 px-2 font-bold font-mono">
                  {colTickets.length}
                </Badge>
              </div>

              {/* Stack */}
              <div className="flex-1 space-y-3.5 overflow-y-auto no-scrollbar max-h-[550px]">
                {colTickets.map(ticket => {
                  const sla = getSLADetails(ticket.created_at);
                  const isClosed = ticket.status === "RESOLVED";

                  return (
                    <motion.div
                      whileHover={{ y: -2 }}
                      key={ticket.id}
                      onClick={() => router.push(`/support-center/tickets/${ticket.id}`)}
                      className="rounded-xl border border-border bg-surface-2 hover:border-border/80 p-3.5 transition-all cursor-pointer relative group flex flex-col gap-2.5 shadow-sm"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-[9px] font-bold text-[var(--text-tertiary)] truncate block max-w-[120px]">
                          {getOrgName(ticket.organization_id)}
                        </span>
                        <Badge className={cn("text-[8px] py-0 px-1.5 font-bold uppercase border shrink-0", PRIORITY_STYLES[ticket.priority] || "bg-surface-2")}>
                          {ticket.priority}
                        </Badge>
                      </div>

                      <h4 className="text-xs font-semibold text-[var(--text-primary)] leading-normal truncate group-hover:text-[var(--brand-primary)] transition-colors">
                        {ticket.subject}
                      </h4>

                      {!isClosed && (
                        <div className={cn(
                          "flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider font-mono",
                          sla.isBreached ? "text-[var(--danger)]" : sla.isWarning ? "text-[var(--warning)]" : "text-[var(--success)]"
                        )}>
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>{sla.text}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between border-t border-border/40 pt-2.5 mt-1 text-[9px] text-[var(--text-tertiary)] font-mono">
                        <span className="flex items-center gap-1">
                          <UserPlus className="w-3 h-3" />
                          {ticket.assigned_agent.split(" ")[0]}
                        </span>
                        <span>{formatDistanceToNow(new Date(ticket.created_at))} ago</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </PageContainer>
  );
}
