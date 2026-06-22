"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { 
  ClipboardList, Search, Plus, Filter, Eye, 
  CheckCircle, ArrowUpRight, Clock, ShieldAlert, Sparkles 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

export default function RequestsQueue() {
  const { eventId } = useParams();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);

  useEffect(() => {
    // Simulated database query payload matching backend response model
    setTimeout(() => {
      setRequests([
        {
          id: "r1",
          request_number: "REQ-20260622-0001",
          title: "Main Room Presentation Streaming Setup",
          description: "High performance streaming rig, VLAN configuration, and bonded cellular failover.",
          status: "IN_PROGRESS",
          priority: "CRITICAL",
          request_type: "STREAMING",
          created_at: "2026-06-22T08:12:00Z",
          items: [
            { id: "i1", service_name: "Streaming Encoder Rig Rental", quantity: 1, notes: "Needs backup power UPS" },
            { id: "i2", service_name: "Bonded Cellular Access Point", quantity: 2, notes: "Requires secondary carrier SIMs" }
          ],
          requirements: [
            { id: "req1", requirement_type: "NETWORK", requirement_data: { wifi_users: 150, symmetric_mbps: 100 } }
          ]
        },
        {
          id: "r2",
          request_number: "REQ-20260622-0002",
          title: "Speaker Ready Room Presentation Preview Stations",
          description: "4 dedicated preview laptops linked to central speaker server database.",
          status: "SUBMITTED",
          priority: "HIGH",
          request_type: "SPEAKER_READY",
          created_at: "2026-06-22T09:45:00Z",
          items: [
            { id: "i3", service_name: "Laptops & Hub Interface", quantity: 4, notes: "Pre-load Eventos preview app" }
          ],
          requirements: [
            { id: "req2", requirement_type: "SRR", requirement_data: { stations: 4, preview_screens: 4 } }
          ]
        },
        {
          id: "r3",
          request_number: "REQ-20260622-0003",
          title: "Self-Service Badge Printing Kiosks",
          description: "3 automated badge printing terminal kiosks for main entrance lobby",
          status: "DRAFT",
          priority: "MEDIUM",
          request_type: "REGISTRATION",
          created_at: "2026-06-22T10:15:00Z",
          items: [
            { id: "i4", service_name: "Badge Kiosk Unit", quantity: 3, notes: "Heavy-duty print mechanisms" }
          ],
          requirements: []
        }
      ]);
      setLoading(false);
    }, 600);
  }, [eventId]);

  const handleAction = (requestId: string, newStatus: string) => {
    setRequests((prev: any[]) => prev.map(r => r.id === requestId ? { ...r, status: newStatus } : r));
    if (selectedRequest && selectedRequest.id === requestId) {
      setSelectedRequest((prev: any) => prev ? { ...prev, status: newStatus } : null);
    }
  };

  const getPriorityBadge = (prio: string) => {
    switch (prio) {
      case "CRITICAL":
        return "bg-rose-500/10 text-rose-500 border-rose-500/20";
      case "HIGH":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "MEDIUM":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      default:
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "IN_PROGRESS":
        return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "SUBMITTED":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "DRAFT":
        return "bg-zinc-500/15 text-zinc-400 border-zinc-500/10";
      default:
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    }
  };

  return (
    <div className="p-6 space-y-8 h-full overflow-hidden flex flex-col">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] text-glow-indigo">
            Service <span className="text-[var(--sec)]">Requests Queue</span>
          </h1>
          <p className="text-muted font-bold text-xs uppercase tracking-[0.2em] opacity-80">
            Request, configure, and approve event technology services
          </p>
        </div>
        <Button className="h-11 px-6 bg-[var(--pri)] hover:bg-[var(--sec)] text-white font-black uppercase tracking-widest text-[11px] rounded-full hover-lift-3d">
          <Plus className="mr-2 h-4 w-4" /> Create Request
        </Button>
      </div>

      {/* Main Container splits list and detail */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-8 overflow-hidden min-h-0">
        {/* List Section */}
        <div className="lg:col-span-3 flex flex-col space-y-4 overflow-hidden h-full">
          {/* Search bar */}
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <Input 
                placeholder="Search requests..."
                className="pl-11 h-11 bg-[var(--card)]/40 border-default rounded-xl font-medium"
              />
            </div>
            <Button variant="outline" className="h-11 px-4 border-default rounded-xl">
              <Filter className="h-4 w-4 text-muted" />
            </Button>
          </div>

          {/* List items */}
          <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
            {requests.map((r, idx) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => setSelectedRequest(r)}
                className={`p-6 rounded-3xl border cursor-pointer transition-all duration-300 ${
                  selectedRequest?.id === r.id 
                    ? "bg-[var(--pri)]/5 border-[var(--pri)]/40 shadow-lg" 
                    : "bg-[var(--card)]/30 border-default hover:border-[var(--muted)]/50"
                }`}
              >
                <div className="flex justify-between items-start gap-4 mb-3">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-muted tracking-widest uppercase">{r.request_number}</span>
                    <h3 className="text-sm font-black text-[var(--text)] tracking-tight leading-tight">{r.title}</h3>
                  </div>
                  <Badge className={`border px-2 py-0.5 text-[8px] font-black tracking-wider uppercase rounded-lg ${getPriorityBadge(r.priority)}`}>
                    {r.priority}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted line-clamp-2 leading-relaxed mb-4">{r.description}</p>
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-muted">
                  <span>Type: {r.request_type}</span>
                  <Badge className={`border-0 rounded-lg ${getStatusBadge(r.status)}`}>{r.status}</Badge>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Detail Section */}
        <div className="lg:col-span-2 overflow-hidden h-full flex flex-col">
          {selectedRequest ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-3d p-8 rounded-[2.5rem] border-default flex-1 overflow-y-auto custom-scrollbar flex flex-col justify-between"
            >
              <div className="space-y-6">
                <div className="flex justify-between items-start pb-4 border-b border-default/50">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-muted tracking-widest uppercase">{selectedRequest.request_number}</span>
                    <h2 className="text-lg font-black text-[var(--text)] tracking-tight leading-tight">{selectedRequest.title}</h2>
                  </div>
                  <Badge className={`border px-3 py-1 text-[9px] font-black tracking-widest uppercase rounded-lg ${getPriorityBadge(selectedRequest.priority)}`}>
                    {selectedRequest.priority}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <h4 className="text-[10px] font-black text-muted uppercase tracking-widest">Description</h4>
                  <p className="text-xs text-[var(--text)] leading-relaxed">{selectedRequest.description}</p>
                </div>

                {/* Items */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-muted uppercase tracking-widest">Catalog Items Ordered</h4>
                  <div className="space-y-2">
                    {selectedRequest.items.map((item: any) => (
                      <div key={item.id} className="p-3 rounded-xl bg-[var(--card)]/40 border border-default flex justify-between items-center">
                        <div className="space-y-1">
                          <p className="text-[11px] font-black text-[var(--text)]">{item.service_name}</p>
                          <p className="text-[9px] text-muted font-medium">{item.notes}</p>
                        </div>
                        <Badge variant="outline" className="border-default font-black text-[10px]">Qty: {item.quantity}</Badge>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Specifications */}
                {selectedRequest.requirements.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-muted uppercase tracking-widest">Technical Specifications</h4>
                    <div className="p-4 rounded-xl bg-[var(--card)]/40 border border-default space-y-2">
                      {selectedRequest.requirements.map((req: any) => (
                        <div key={req.id} className="text-[11px] leading-relaxed">
                          <p className="font-black text-[var(--pri)] uppercase text-[9px] tracking-wider mb-1">Requirement Type: {req.requirement_type}</p>
                          {Object.entries(req.requirement_data).map(([key, val]: any) => (
                            <div key={key} className="flex justify-between border-b border-default/30 py-1">
                              <span className="text-muted capitalize">{key.replace("_", " ")}</span>
                              <span className="font-bold text-[var(--text)]">{val}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="pt-6 border-t border-default/50 flex gap-3 mt-6">
                {selectedRequest.status === "DRAFT" && (
                  <Button 
                    onClick={() => handleAction(selectedRequest.id, "SUBMITTED")}
                    className="flex-1 h-12 bg-[var(--pri)] hover:bg-[var(--sec)] font-black text-[10px] uppercase tracking-widest"
                  >
                    Submit Request
                  </Button>
                )}
                {selectedRequest.status === "SUBMITTED" && (
                  <Button 
                    onClick={() => handleAction(selectedRequest.id, "IN_PROGRESS")}
                    className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest"
                  >
                    Approve & Spawn Project
                  </Button>
                )}
                <Button variant="outline" className="h-12 border-default px-4">
                  Cancel
                </Button>
              </div>
            </motion.div>
          ) : (
            <div className="flex-1 rounded-[2.5rem] border border-dashed border-default flex flex-col items-center justify-center text-center p-8 bg-[var(--card)]/10">
              <ClipboardList className="h-12 w-12 text-muted mb-4 opacity-50" />
              <p className="text-sm font-black text-[var(--text)] tracking-tight uppercase tracking-wider">Select a Service Request</p>
              <p className="text-xs text-muted max-w-[200px] leading-relaxed mt-2">Choose any request from the queue to view its configuration, line items, and approval steps.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
