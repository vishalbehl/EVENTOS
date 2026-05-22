"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Printer, RefreshCw, PlusCircle, CheckCircle, XCircle, Clock, 
  AlertTriangle, Play, AlertCircle, FileText, Settings, User, 
  MapPin, Eye, RotateCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { apiGet, apiPost, apiPatch } from "@/lib/api-client";

interface PrintJob {
  id: string;
  badge_id: string;
  printer_id: string;
  status: "queued" | "printing" | "completed" | "failed";
  queued_at: string;
  printed_at?: string;
  // Resolved in FE:
  participant_name?: string;
  badge_code?: string;
  printer_name?: string;
}

interface PrinterDevice {
  id: string;
  name: string;
  ip_address: string;
  location: string;
  status: "online" | "offline" | "idle" | "printing";
}

interface Participant {
  id: string;
  name: string;
}

interface Badge {
  id: string;
  participant_id: string;
  badge_code: string;
}

export default function PrintQueuePage() {
  const { eventId } = useParams();

  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [printers, setPrinters] = useState<PrinterDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [registerModalOpen, setRegisterModalOpen] = useState(false);

  // New Printer form fields
  const [printerName, setPrinterName] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [location, setLocation] = useState("");

  // Resolvers maps
  const [participants, setParticipants] = useState<Record<string, string>>({}); // id -> name
  const [badges, setBadges] = useState<Record<string, { code: string; name: string }>>({}); // badge_id -> { code, name }

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // 1. Fetch printers & print jobs
      const [printersRes, jobsRes] = await Promise.all([
        apiGet<PrinterDevice[]>(`/events/${eventId}/printers`),
        apiGet<PrintJob[]>(`/events/${eventId}/badges/print-jobs`)
      ]);

      setPrinters(printersRes || []);
      
      // 2. Fetch participants & badges to resolve names in FE
      const [participantsRes, badgesRes] = await Promise.all([
        apiGet<any[]>(`/events/${eventId}/participants`),
        apiGet<any[]>(`/events/${eventId}/badges`).catch(() => [])
      ]);

      const partMap: Record<string, string> = {};
      participantsRes?.forEach(p => {
        partMap[p.id] = p.name;
      });
      setParticipants(partMap);

      const badgeMap: Record<string, { code: string; name: string }> = {};
      badgesRes?.forEach(b => {
        badgeMap[b.id] = {
          code: b.badge_code,
          name: partMap[b.participant_id] || "Unknown Participant"
        };
      });
      setBadges(badgeMap);

      // Resolve Job labels
      const resolvedJobs = (jobsRes || []).map(job => {
        const badgeInfo = badgeMap[job.badge_id];
        const printer = printersRes?.find(p => p.id === job.printer_id);
        return {
          ...job,
          participant_name: badgeInfo?.name || "Unknown Participant",
          badge_code: badgeInfo?.code || "BDG-UNKNOWN",
          printer_name: printer?.name || "Printer Room"
        };
      });

      setJobs(resolvedJobs);
    } catch (err) {
      console.error(err);
      toast.error("Failed to sync queue data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchData();
    }
  }, [eventId]);

  const handleRegisterPrinter = async () => {
    if (!printerName.trim() || !ipAddress.trim() || !location.trim()) {
      toast.error("All printer fields are required.");
      return;
    }

    try {
      await apiPost(`/events/${eventId}/printers/register`, {
        name: printerName,
        ip_address: ipAddress,
        location: location,
        status: "idle"
      });
      toast.success(`Registered printer: ${printerName}`);
      setRegisterModalOpen(false);
      setPrinterName("");
      setIpAddress("");
      setLocation("");
      fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.detail || "Failed to register printer.");
    }
  };

  const updateJobStatus = async (jobId: string, newStatus: string) => {
    try {
      await apiPatch(`/events/${eventId}/badges/print-jobs/${jobId}?status_update=${newStatus}`, {});
      toast.success(`Job marked as ${newStatus}`);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error("Failed to update job status.");
    }
  };

  const handleReprintJob = async (badgeId: string, printerId: string) => {
    try {
      await apiPost(`/events/${eventId}/badges/reprint`, {
        badge_id: badgeId,
        printer_id: printerId,
        reason: "damaged"
      });
      toast.success("Reprint job queued successfully!");
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error("Failed to reprint badge.");
    }
  };

  // Compute metrics
  const metrics = useMemo(() => {
    return {
      queued: jobs.filter(j => j.status === "queued").length,
      printing: jobs.filter(j => j.status === "printing").length,
      completed: jobs.filter(j => j.status === "completed").length,
      failed: jobs.filter(j => j.status === "failed").length
    };
  }, [jobs]);

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[var(--text)] flex items-center gap-3">
            <Printer className="h-8 w-8 text-[var(--pri)]" />
            Badge Print Queue
          </h1>
          <p className="text-sm text-muted mt-1">
            Monitor real-time badge print spoolers, manage hardware status, and manage reprints.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setRegisterModalOpen(true)}
            className="bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-white font-bold glass-3d flex items-center gap-2"
          >
            <PlusCircle className="h-4 w-4" />
            Add Printer Device
          </Button>
          <Button 
            variant="outline" 
            onClick={fetchData}
            disabled={loading}
            className="glass-3d flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Sync Spoolers
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 glass-3d border-default bg-[var(--surf)]/10 flex items-center justify-between">
          <div>
            <span className="text-xs text-muted font-bold uppercase">Queued Jobs</span>
            <div className="text-2xl font-black text-amber-400 mt-1">{metrics.queued}</div>
          </div>
          <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500">
            <Clock className="h-5 w-5" />
          </div>
        </Card>

        <Card className="p-4 glass-3d border-default bg-[var(--surf)]/10 flex items-center justify-between">
          <div>
            <span className="text-xs text-muted font-bold uppercase">Active Printing</span>
            <div className="text-2xl font-black text-indigo-400 mt-1">{metrics.printing}</div>
          </div>
          <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-500">
            <Printer className="h-5 w-5" />
          </div>
        </Card>

        <Card className="p-4 glass-3d border-default bg-[var(--surf)]/10 flex items-center justify-between">
          <div>
            <span className="text-xs text-muted font-bold uppercase">Completed Prints</span>
            <div className="text-2xl font-black text-emerald-400 mt-1">{metrics.completed}</div>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500">
            <CheckCircle className="h-5 w-5" />
          </div>
        </Card>

        <Card className="p-4 glass-3d border-default bg-[var(--surf)]/10 flex items-center justify-between">
          <div>
            <span className="text-xs text-muted font-bold uppercase">Spool Errors</span>
            <div className="text-2xl font-black text-rose-500 mt-1">{metrics.failed}</div>
          </div>
          <div className="p-3 bg-rose-500/10 rounded-xl text-rose-500">
            <AlertTriangle className="h-5 w-5" />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Print Queue Spool */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted" />
            Print Spooler
          </h2>
          <Card className="glass-3d overflow-hidden border-default bg-[var(--surf)]/20">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center text-muted">
                <RefreshCw className="h-8 w-8 animate-spin text-[var(--pri)] mb-4" />
                <p className="text-sm font-medium">Connecting to print server...</p>
              </div>
            ) : jobs.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-muted">
                <FileText className="h-12 w-12 text-muted/40 mb-4" />
                <p className="text-lg font-bold">Spooler is empty</p>
                <p className="text-sm mt-1">No print jobs are currently in the spooler.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-default bg-[var(--surf)]/50 text-xs font-bold uppercase tracking-wider text-muted">
                      <th className="p-4">Participant & Badge</th>
                      <th className="p-4">Spooled Printer</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Spooled At</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => {
                      let statusBadge = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                      if (job.status === "completed") {
                        statusBadge = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                      } else if (job.status === "failed") {
                        statusBadge = "bg-rose-500/10 text-rose-500 border-rose-500/20";
                      } else if (job.status === "printing") {
                        statusBadge = "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 animate-pulse";
                      }

                      return (
                        <tr key={job.id} className="border-b border-default transition-colors hover:bg-[var(--surf)]/40">
                          <td className="p-4">
                            <div className="flex flex-col">
                              <span className="font-semibold text-sm flex items-center gap-1">
                                <User className="h-3 w-3 text-muted" />
                                {job.participant_name}
                              </span>
                              <span className="text-xs text-muted font-mono mt-0.5">{job.badge_code}</span>
                            </div>
                          </td>
                          <td className="p-4 text-sm font-medium">
                            <span className="flex items-center gap-1 text-muted">
                              <Printer className="h-3 w-3" />
                              {job.printer_name}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className={`text-[10px] uppercase font-bold border px-2 py-0.5 rounded-full ${statusBadge}`}>
                              {job.status}
                            </span>
                          </td>
                          <td className="p-4 text-xs text-muted">
                            {new Date(job.queued_at).toLocaleTimeString()}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {job.status === "queued" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => updateJobStatus(job.id, "printing")}
                                  className="h-8 text-indigo-400 hover:bg-indigo-500/10"
                                >
                                  Start
                                </Button>
                              )}
                              {job.status === "printing" && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => updateJobStatus(job.id, "completed")}
                                    className="h-8 text-emerald-400 hover:bg-emerald-500/10"
                                  >
                                    Done
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => updateJobStatus(job.id, "failed")}
                                    className="h-8 text-rose-500 hover:bg-rose-500/10"
                                  >
                                    Fail
                                  </Button>
                                </>
                              )}
                              {(job.status === "completed" || job.status === "failed") && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleReprintJob(job.badge_id, job.printer_id)}
                                  className="h-8 text-[var(--pri)] hover:bg-[var(--pri)]/10 flex items-center gap-1"
                                >
                                  <RotateCw className="h-3.5 w-3.5" />
                                  Reprint
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Printer Devices configuration */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted" />
            Printer Devices
          </h2>
          <div className="space-y-4">
            {printers.map((printer) => {
              const isOffline = printer.status === "offline";
              const isPrinting = printer.status === "printing";
              const dotColor = isOffline ? "bg-rose-500" : isPrinting ? "bg-indigo-500" : "bg-emerald-400";

              return (
                <Card 
                  key={printer.id} 
                  className="p-4 glass-3d border-default bg-[var(--surf)]/20 hover:border-[var(--pri)]/40 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-background/50 rounded-xl border border-default">
                        <Printer className="h-5 w-5 text-[var(--pri)]" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm leading-none">{printer.name}</h3>
                        <span className="text-xs text-muted font-mono mt-1 block">{printer.ip_address}</span>
                      </div>
                    </div>
                    <span className="flex items-center gap-1.5 text-xs font-bold text-muted capitalize">
                      <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
                      {printer.status}
                    </span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-default/50 flex items-center justify-between text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {printer.location}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* Add Printer Modal */}
      {registerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md bg-[var(--surf)] border border-default p-6 rounded-2xl glass-3d space-y-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Printer className="h-5 w-5 text-[var(--pri)]" />
                Register New Printer
              </h2>
              <button 
                onClick={() => setRegisterModalOpen(false)}
                className="text-muted hover:text-white"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">Printer Name</label>
                <Input
                  value={printerName}
                  onChange={(e) => setPrinterName(e.target.value)}
                  placeholder="e.g. Zebra ZD620 Hall A"
                  className="bg-background/50 border-default focus-visible:ring-[var(--pri)]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">IP Address / Port</label>
                <Input
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                  placeholder="e.g. 192.168.1.150"
                  className="bg-background/50 border-default focus-visible:ring-[var(--pri)]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">Location / Desk</label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Main Reception, Hall Entrance"
                  className="bg-background/50 border-default focus-visible:ring-[var(--pri)]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setRegisterModalOpen(false)}
                className="glass-3d"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRegisterPrinter}
                className="bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-white font-bold"
              >
                Register Hardware
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
