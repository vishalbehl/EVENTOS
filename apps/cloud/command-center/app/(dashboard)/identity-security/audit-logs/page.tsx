"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  usePlatformAudit, 
  useAdminOrgs
} from "@/services/super-admin-service";
import { 
  Receipt, RefreshCw, Search, Calendar, Lock, Unlock, ShieldCheck, ShieldAlert, 
  Download, FileSpreadsheet, Fingerprint, ChevronDown, ChevronRight, Eye, ShieldQuestion,
  User, Check, Copy, AlertCircle
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import { StatusBadge } from "@/components/super-admin/ui/StatusBadge";

export interface AuditLog {
  id: string;
  action_type: string;
  actor_user_id?: string;
  organization_name?: string;
  resource_type: string;
  resource_id?: string;
  actor_ip?: string;
  actor_user_agent?: string;
  row_hash?: string;
  old_state?: Record<string, any>;
  new_state?: Record<string, any>;
  occurred_at?: string;
  request_id?: string;
  correlation_id?: string;
}

export default function AuditExplorerPage() {
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const limit = 20;

  // Filter States
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actorQuery, setActorQuery] = useState("");
  const [selectedActionGroup, setSelectedActionGroup] = useState("ALL");
  const [selectedOrg, setSelectedOrg] = useState("ALL");
  
  const [sensitiveOnly, setSensitiveOnly] = useState(false);
  const [myActivityOnly, setMyActivityOnly] = useState(false);
  
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedStatus, setVerifiedStatus] = useState<"idle" | "success" | "incomplete">("idle");
  const [missingIntegrityIds, setMissingIntegrityIds] = useState<string[]>([]);
  const [showJsonPanel, setShowJsonPanel] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  const debouncedActor = useDebounce(actorQuery, 400);

  // Queries
  const { data: orgs = [] } = useAdminOrgs({ limit: 100 });
  const { data, isLoading, refetch } = usePlatformAudit({
    cursor: cursor || undefined,
    limit,
    is_sensitive: sensitiveOnly ? true : undefined,
    organization_id: selectedOrg === "ALL" ? undefined : selectedOrg,
    actor_user_id: debouncedActor || undefined,
    action_type: selectedActionGroup === "ALL" || ["SECURITY", "BILLING"].includes(selectedActionGroup) ? undefined : selectedActionGroup,
  });

  const rawLogs = data?.items || [];
  const hasNext = data?.has_next || false;
  const nextCursorVal = data?.next_cursor || null;

  const logs = useMemo(() => {
    return rawLogs.filter(log => {
      const matchActionGroup = (() => {
        if (selectedActionGroup === "ALL") return true;
        if (selectedActionGroup === "SECURITY") return ["PASSWORD_RESET", "2FA_DISABLE"].includes(log.action_type);
        if (selectedActionGroup === "BILLING") return log.action_type === "PLAN_CHANGE";
        return log.action_type === selectedActionGroup;
      })();

      const matchDates = (() => {
        if (!log.occurred_at) return true;
        const oTime = new Date(log.occurred_at).getTime();
        if (dateFrom && oTime < new Date(dateFrom).getTime()) return false;
        if (dateTo && oTime > new Date(dateTo).getTime()) return false;
        return true;
      })();

      return matchActionGroup && matchDates;
    });
  }, [rawLogs, selectedActionGroup, dateFrom, dateTo]);

  const actionGroups = useMemo(() => {
    const countFor = (id: string) => {
      if (id === "ALL") return rawLogs.length;
      if (id === "SECURITY") return rawLogs.filter((log) => ["PASSWORD_RESET", "2FA_DISABLE"].includes(log.action_type)).length;
      if (id === "BILLING") return rawLogs.filter((log) => log.action_type === "PLAN_CHANGE").length;
      return rawLogs.filter((log) => log.action_type === id).length;
    };

    return [
      { id: "ALL", label: "All Logs", count: countFor("ALL") },
      { id: "CREATE", label: "Create", count: countFor("CREATE") },
      { id: "UPDATE", label: "Update", count: countFor("UPDATE") },
      { id: "DELETE", label: "Delete", count: countFor("DELETE") },
      { id: "LOGIN", label: "Login", count: countFor("LOGIN") },
      { id: "LOGOUT", label: "Logout", count: countFor("LOGOUT") },
      { id: "IMPERSONATE", label: "Impersonate", count: countFor("IMPERSONATE") },
      { id: "SECURITY", label: "Security", count: countFor("SECURITY") },
      { id: "BILLING", label: "Billing", count: countFor("BILLING") },
    ];
  }, [rawLogs]);

  // Set default selected log on data load
  useEffect(() => {
    if (logs.length > 0 && !selectedLog) {
      setSelectedLog(logs[0]);
    }
  }, [logs, selectedLog]);

  // Handle Verify Integrity
  const handleVerify = async () => {
    setIsVerifying(true);
    setVerifiedStatus("idle");
    setMissingIntegrityIds([]);
    
    const missingIds = logs.filter((log) => !log.row_hash).map((log) => log.id);

    if (missingIds.length > 0) {
      setMissingIntegrityIds(missingIds);
      setVerifiedStatus("incomplete");
      toast.warning(`Integrity metadata missing on ${missingIds.length} visible audit entr${missingIds.length === 1 ? "y" : "ies"}.`);
    } else {
      setVerifiedStatus("success");
      toast.success(`Integrity metadata present on all ${logs.length} visible audit entr${logs.length === 1 ? "y" : "ies"}.`);
    }
    setIsVerifying(false);
  };

  const handleCopyHash = (hash?: string) => {
    if (!hash) return;
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    toast.success("Hash copied to clipboard");
    setTimeout(() => setCopiedHash(false), 2000);
  };

  return (
    <PageContainer className="space-y-4">
      <SectionHeader
        title="Audit Log Explorer"
        description="Verify SIEM transaction histories, cryptographic logs, and administrative configuration shifts."
        breadcrumb={["Console", "Security", "Audit"]}
        actions={
          <div className="flex gap-2">
            <Button
              onClick={handleVerify}
              disabled={isVerifying}
              className="border border-[var(--success)] bg-[var(--success-muted)] hover:bg-[var(--success-muted)]/80 text-[var(--success)] text-xs font-semibold rounded-xl"
            >
              {isVerifying ? (
                <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />
              ) : (
                <Fingerprint className="w-3.5 h-3.5 mr-2" />
              )}
              {isVerifying ? "Checking..." : "Check Integrity Metadata"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled
              title="Audit exports require durable export-job records and authorization-gated downloads before exposure."
              className="border-border"
            >
              <Download className="w-3.5 h-3.5 mr-2" />
              Export unavailable
            </Button>
          </div>
        }
      />

      {/* 3-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start min-h-[600px]">
        {/* Left Column — Quick Filters (20% -> lg:col-span-2) */}
        <div className="lg:col-span-2 space-y-4">
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2.5">
              Action Type
            </span>
            <div className="space-y-1">
              {actionGroups.map((g) => {
                const isActive = selectedActionGroup === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => setSelectedActionGroup(g.id)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-all text-left",
                      isActive
                        ? "bg-[var(--brand-primary-muted)] border-l-2 border-[var(--brand-primary)] rounded-l-none text-[var(--brand-primary)]"
                        : "text-[var(--text-secondary)] hover:bg-surface-hover/30 hover:text-[var(--text-primary)]"
                    )}
                  >
                    <span>{g.label}</span>
                    <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{g.count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sensitiveOnly}
                onChange={(e) => setSensitiveOnly(e.target.checked)}
                className="rounded border-border bg-surface text-[var(--brand-primary)] focus:ring-0 focus:ring-offset-0"
              />
              <span className="text-xs text-[var(--text-secondary)] font-medium">Sensitive Only</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={myActivityOnly}
                onChange={(e) => setMyActivityOnly(e.target.checked)}
                className="rounded border-border bg-surface text-[var(--brand-primary)] focus:ring-0 focus:ring-offset-0"
              />
              <span className="text-xs text-[var(--text-secondary)] font-medium">My Activity Only</span>
            </label>
          </div>
        </div>

        {/* Center Column — Log Feed (55% -> lg:col-span-7) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Top Filter Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="text"
                value={actorQuery}
                onChange={(e) => setActorQuery(e.target.value)}
                placeholder="Search actor IP/ID..."
                className="w-full bg-surface border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-primary)]"
              />
            </div>
            
            <select
              value={selectedOrg}
              onChange={(e) => setSelectedOrg(e.target.value)}
              className="bg-surface border border-border rounded-xl text-xs py-1.5 px-3 focus:outline-none cursor-pointer w-full"
            >
              <option value="ALL">All Organizations</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>

            <div className="flex gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-surface border border-border rounded-xl text-xs px-2 py-1 w-full focus:outline-none cursor-pointer"
              />
            </div>
          </div>

          {/* Verification Status Banner */}
          {verifiedStatus === "success" && (
            <div className="p-3 bg-[var(--success-muted)] border border-success/20 rounded-xl text-[var(--success)] text-xs font-medium flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Integrity metadata is present for all visible audit entries.
            </div>
          )}
          {verifiedStatus === "incomplete" && (
            <div className="p-3 bg-[var(--warning-muted)] border border-warning/20 rounded-xl text-[var(--warning)] text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Integrity metadata is incomplete for {missingIntegrityIds.length} visible audit entr{missingIntegrityIds.length === 1 ? "y" : "ies"}.
            </div>
          )}

          {/* Logs Feed List */}
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
            {isLoading ? (
              <div className="p-12 text-center text-xs text-[var(--text-tertiary)] flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> Querying compliance databases...
              </div>
            ) : logs.length === 0 ? (
              <p className="text-center text-xs text-[var(--text-tertiary)] py-12">No audit logs matching current query.</p>
            ) : (
              logs.map((log) => {
                const isSelected = selectedLog?.id === log.id;
                const isMissingIntegrity = missingIntegrityIds.includes(log.id);
                return (
                  <div
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className={cn(
                      "bg-surface border rounded-xl p-4 transition-all duration-100 cursor-pointer flex flex-col gap-2.5",
                      isSelected ? "border-[var(--brand-primary)] bg-[var(--brand-primary-muted)]" : "border-border hover:border-border/80",
                      isMissingIntegrity && "border-l-4 border-l-[var(--warning)]"
                    )}
                  >
                    {/* Row 1 */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                          log.action_type === "DELETE" && "bg-danger-muted text-danger",
                          log.action_type === "UPDATE" && "bg-warning-muted text-warning",
                          log.action_type === "CREATE" && "bg-success-muted text-success",
                          !["DELETE", "UPDATE", "CREATE"].includes(log.action_type) && "bg-surface-2 text-[var(--text-secondary)]"
                        )}>
                          {log.action_type}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                          <User className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                          <span>{log.actor_user_id ? log.actor_user_id.slice(0, 8) : "System"}</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
                        {log.occurred_at ? formatDistanceToNow(new Date(log.occurred_at), { addSuffix: true }) : "—"}
                      </span>
                    </div>

                    {/* Row 2 */}
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      Executed administrative action targeting {log.resource_type} node (ID: {log.resource_id ? log.resource_id.slice(0, 12) : "N/A"})
                    </p>

                    {/* Row 3 */}
                    <div className="flex items-center gap-4 text-[10px] text-[var(--text-tertiary)] font-mono">
                      <span>IP: {log.actor_ip || "Not recorded"}</span>
                      <span>Org: {log.organization_name || "Platform"}</span>
                      <span className={cn(
                        "w-2 h-2 rounded-full ml-auto",
                        log.action_type === "DELETE" ? "bg-[var(--danger)]" : log.action_type === "UPDATE" ? "bg-[var(--warning)]" : "bg-[var(--success)]"
                      )}></span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination Controls */}
          {logs.length > 0 && (
            <div className="flex items-center justify-between border-t border-border pt-4 text-xs">
              <Button
                variant="outline"
                disabled={cursorHistory.length === 0}
                onClick={() => {
                  const prevHistory = [...cursorHistory];
                  prevHistory.pop(); // Remove current cursor
                  const prevCursor = prevHistory[prevHistory.length - 1] || null;
                  setCursor(prevCursor);
                  setCursorHistory(prevHistory);
                }}
                className="h-8 text-xs font-semibold px-4 border-border"
              >
                Previous Page
              </Button>
              <Button
                variant="outline"
                disabled={!hasNext || !nextCursorVal}
                onClick={() => {
                  if (nextCursorVal) {
                    setCursor(nextCursorVal);
                    setCursorHistory([...cursorHistory, nextCursorVal]);
                  }
                }}
                className="h-8 text-xs font-semibold px-4 border-border"
              >
                Next Page
              </Button>
            </div>
          )}
        </div>

        {/* Right Column — Log Detail (25% -> lg:col-span-3) */}
        <div className="lg:col-span-3">
          {selectedLog ? (
            <div className="bg-surface border border-border rounded-xl p-5 space-y-5 shadow-sm text-xs">
              <div className="space-y-1.5 pb-3 border-b border-border">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">Transaction Detail</h4>
                <p className="font-mono text-[9px] bg-surface-2 px-2.5 py-1 rounded text-[var(--text-primary)] break-all select-all">
                  LOG_ID: {selectedLog.id}
                </p>
              </div>

              {/* Attributes */}
              <div className="space-y-3">
                {[
                  { label: "Request ID", val: selectedLog.request_id || "Not recorded" },
                  { label: "Correlation ID", val: selectedLog.correlation_id || "Not recorded" },
                ].map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <span className="text-[10px] text-[var(--text-tertiary)] font-medium">{item.label}</span>
                    <p className="font-mono text-[10px] bg-surface-2 px-2 py-0.5 rounded truncate select-all">{item.val}</p>
                  </div>
                ))}
              </div>

              {/* Actor & Org */}
              <div className="space-y-3.5 border-t border-border pt-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-[var(--text-tertiary)] font-medium">Actor Identity</span>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[var(--brand-primary-muted)] text-[var(--brand-primary)] flex items-center justify-center font-bold text-[10px]">
                      A
                    </div>
                    <span className="font-semibold text-[var(--text-primary)] truncate">{selectedLog.actor_user_id || "System Operator"}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-[var(--text-tertiary)] font-medium">Target Organization</span>
                  <p className="font-semibold text-[var(--text-primary)] truncate">{selectedLog.organization_name || "Core Infrastructure"}</p>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-[var(--text-tertiary)] font-medium">Resource Target</span>
                  <p className="font-semibold text-[var(--text-primary)] font-mono">{selectedLog.resource_type}: {selectedLog.resource_id?.slice(0, 12) || "N/A"}</p>
                </div>
              </div>

              {/* Network */}
              <div className="space-y-3 border-t border-border pt-4">
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <span className="text-[9px] text-[var(--text-tertiary)] block">IP Address</span>
                    <span className="font-mono font-bold text-[var(--text-primary)]">{selectedLog.actor_ip || "Not recorded"}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-[var(--text-tertiary)] block">OS / Agent</span>
                    <span className="font-bold text-[var(--text-primary)] truncate block max-w-[100px]">{selectedLog.actor_user_agent || "Not recorded"}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-[var(--text-tertiary)] font-medium">SIEM Cryptographic Hash</span>
                  <div className="flex items-center gap-2 font-mono text-[9px] bg-surface-2 p-1.5 rounded text-[var(--text-tertiary)]">
                    <span className="truncate flex-1">{selectedLog.row_hash || "Integrity hash not recorded"}</span>
                    <button onClick={() => handleCopyHash(selectedLog.row_hash)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                      {copiedHash ? <Check className="w-3.5 h-3.5 text-[var(--success)]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* JSON State Changes (Diff View) */}
              <div className="border-t border-border pt-4 space-y-2">
                <span className="text-[10px] text-[var(--text-tertiary)] font-medium block">Changes Breakdown</span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded bg-[var(--danger-muted)] text-[var(--danger)] font-mono text-[10px] max-h-24 overflow-y-auto no-scrollbar">
                    <span className="font-semibold text-[8px] block opacity-60">- BEFORE</span>
                    <span>{JSON.stringify(selectedLog.old_state || {})}</span>
                  </div>
                  <div className="p-2 rounded bg-[var(--success-muted)] text-[var(--success)] font-mono text-[10px] max-h-24 overflow-y-auto no-scrollbar">
                    <span className="font-semibold text-[8px] block opacity-60">+ AFTER</span>
                    <span>{JSON.stringify(selectedLog.new_state || {})}</span>
                  </div>
                </div>

                <button
                  onClick={() => setShowJsonPanel(!showJsonPanel)}
                  className="text-[10px] text-[var(--brand-primary)] hover:underline font-semibold block pt-1"
                >
                  {showJsonPanel ? "Hide Raw JSON" : "View Full JSON"}
                </button>
              </div>

              {/* Collapsible raw JSON */}
              {showJsonPanel && (
                <pre className="p-3 bg-surface-2 rounded-xl text-[10px] font-mono text-[var(--text-secondary)] overflow-x-auto max-h-48 mt-2 custom-scrollbar border border-border">
                  {JSON.stringify(selectedLog, null, 2)}
                </pre>
              )}
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-xl p-8 text-center text-xs text-[var(--text-tertiary)] shadow-sm">
              <ShieldQuestion className="w-8 h-8 mx-auto mb-2 text-[var(--text-tertiary)] opacity-60" />
              Select a transaction log entry card to view raw telemetry details.
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
