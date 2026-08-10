"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck, Check, X, RefreshCw, Eye, Search, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export default function RegistrationReviewPage() {
  const [pendingList, setPendingList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const res: any = await apiClient.get("/venue/registration/review/pending");
      setPendingList(res || []);
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to load review queue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAction = async (participantId: string, action: "approve" | "reject") => {
    try {
      await apiClient.post("/venue/registration/review/action", {
        participant_id: participantId,
        action,
      });
      toast.success(`Registration ${action === "approve" ? "approved" : "rejected"} successfully!`);
      loadData();
    } catch (e: any) {
      toast.error(e.message || "Action failed");
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full space-y-3 overflow-hidden">
      {/* Header Banner */}
      <div className="shrink-0 bg-[var(--card)] p-4 rounded-2xl border border-[var(--border)] shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-[var(--text)] tracking-tight flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-[var(--pri)]" /> Registration Review & Approval Queue
          </h2>
          <p className="text-xs text-[var(--muted)]">
            Review pending walk-in registrations, verify credentials, and approve badges directly in PostgreSQL venue DB
          </p>
        </div>

        <Button variant="outline" onClick={loadData} disabled={loading} className="h-10 text-xs font-bold gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh Queue
        </Button>
      </div>

      {/* Review Table */}
      <div className="flex-1 min-h-0 bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surf)] border-b border-[var(--border)] text-xs font-black text-[var(--muted)] uppercase tracking-wider">
            <tr>
              <th className="p-4">Reg Code</th>
              <th className="p-4">Delegate Name</th>
              <th className="p-4">Category</th>
              <th className="p-4">Company / Organization</th>
              <th className="p-4">Payment & Review Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)] font-medium text-[var(--text)]">
            {pendingList.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-[var(--muted)] text-xs font-semibold">
                  No pending registrations requiring manual review.
                </td>
              </tr>
            ) : (
              pendingList.map((p) => (
                <tr key={p.id} className="hover:bg-[var(--surf)]/50 transition-colors">
                  <td className="p-4 font-mono font-bold text-[var(--acc)]">{p.regno}</td>
                  <td className="p-4 font-semibold text-[var(--text)]">
                    <div>{p.name}</div>
                    <div className="text-xs text-[var(--muted)] font-normal">{p.email}</div>
                  </td>
                  <td className="p-4">
                    <span className="px-2.5 py-1 rounded-full bg-[var(--surf)] border border-[var(--border)] text-[10px] uppercase font-black text-[var(--text)]">
                      {p.role}
                    </span>
                  </td>
                  <td className="p-4 text-[var(--muted)]">{p.company || "N/A"}</td>
                  <td className="p-4">
                    <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/30 text-xs font-black uppercase tracking-wider">
                      {p.paid_status || "Pending Review"}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <Button
                      size="sm"
                      onClick={() => handleAction(p.id, "reject")}
                      className="h-8 bg-red-600 hover:bg-red-700 text-white font-bold text-xs gap-1"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleAction(p.id, "approve")}
                      className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve & Issue
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);
}
