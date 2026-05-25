"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Box, RefreshCw, PlusCircle, Pencil, 
  CheckCircle2, AlertCircle, ToggleLeft, ToggleRight,
  Users, ArrowUpRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { apiGet, apiPost, apiPatch } from "@/lib/api-client";

interface CapacityStatus {
  id: string;
  level: "event" | "session" | "room";
  target_id: string;
  target_name: string;
  capacity: number;
  current_occupancy: number;
  waitlist_count: number;
  occupancy_rate: number;
}

interface Room {
  id: string;
  name: string;
}

interface Session {
  id: string;
  name: string;
}

export default function CapacityTab() {
  const { eventId } = useParams();

  const [statuses, setStatuses] = useState<CapacityStatus[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(false);

  // Modals
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<CapacityStatus | null>(null);

  // Form fields
  const [level, setLevel] = useState<"event" | "session" | "room">("event");
  const [targetId, setTargetId] = useState("");
  const [capacity, setCapacity] = useState<number>(100);
  const [waitlistEnabled, setWaitlistEnabled] = useState(true);
  const [autoPromote, setAutoPromote] = useState(true);

  const fetchCapacityData = async () => {
    try {
      setLoading(true);
      const [statusRes, roomsRes, sessionsRes] = await Promise.all([
        apiGet<CapacityStatus[]>(`/events/${eventId}/capacity/status`),
        apiGet<Room[]>(`/events/${eventId}/rooms`),
        apiGet<Session[]>(`/events/${eventId}/sessions`)
      ]);
      setStatuses(statusRes || []);
      setRooms(roomsRes || []);
      setSessions(sessionsRes || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load capacity rules.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchCapacityData();
    }
  }, [eventId]);

  const openCreateModal = () => {
    setSelectedStatus(null);
    setLevel("event");
    setTargetId("");
    setCapacity(100);
    setWaitlistEnabled(true);
    setAutoPromote(true);
    setRuleModalOpen(true);
  };

  const openEditModal = (rule: CapacityStatus) => {
    setSelectedStatus(rule);
    setLevel(rule.level);
    setTargetId(rule.target_id);
    setCapacity(rule.capacity);
    // These boolean flags aren't directly in the status payload, so we set defaults
    setWaitlistEnabled(true);
    setAutoPromote(true);
    setRuleModalOpen(true);
  };

  const submitRule = async () => {
    try {
      if (!selectedStatus && level !== "event" && !targetId) {
        toast.error(`Please select a ${level} before saving the capacity rule.`);
        return;
      }

      if (selectedStatus) {
        // Edit existing rule
        await apiPatch(`/events/${eventId}/capacity/${selectedStatus.id}`, {
          capacity,
          waitlist_enabled: waitlistEnabled,
          auto_promote: autoPromote
        });
        toast.success("Capacity rule updated successfully.");
      } else {
        // Create new rule
        const payload: any = {
          capacity,
          waitlist_enabled: waitlistEnabled,
          auto_promote: autoPromote
        };
        if (level === "session") payload.session_id = targetId;
        if (level === "room") payload.room_id = targetId;

        await apiPost(`/events/${eventId}/capacity`, payload);
        toast.success("Capacity rule created successfully.");
      }
      setRuleModalOpen(false);
      fetchCapacityData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.detail || "Failed to save capacity rule.");
    }
  };

  const triggerPromotion = async () => {
    try {
      setPromoting(true);
      const res = await apiPost<any[]>(`/events/${eventId}/capacity/promote`, {});
      if (res && res.length > 0) {
        toast.success(`Successfully promoted ${res.length} participant(s) from waitlist!`);
      } else {
        toast.info("No participants met the promotion criteria or capacity is full.");
      }
      fetchCapacityData();
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to run promotions.");
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[var(--text)] flex items-center gap-3">
            <Box className="h-8 w-8 text-[var(--pri)]" />
            Capacity & Seat Management
          </h1>
          <p className="text-sm text-muted mt-1">
            Configure attendee capacity policies, track real-time occupancy, and promote waitlisted registrations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={triggerPromotion}
            disabled={promoting || loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold glass-3d flex items-center gap-2"
          >
            {promoting ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUpRight className="h-4 w-4" />
            )}
            Run Auto-Promotions
          </Button>
          <Button
            onClick={openCreateModal}
            className="bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-white font-bold glass-3d flex items-center gap-2"
          >
            <PlusCircle className="h-4 w-4" />
            Add Rule
          </Button>
          <Button 
            variant="outline" 
            onClick={fetchCapacityData}
            disabled={loading}
            className="glass-3d p-2.5"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Occupancy overview cards */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-muted">
          <RefreshCw className="h-8 w-8 animate-spin text-[var(--pri)] mb-4" />
          <p className="text-sm font-medium">Analyzing live occupation matrix...</p>
        </div>
      ) : statuses.length === 0 ? (
        <Card className="p-12 text-center glass-3d border-default bg-[var(--surf)]/20">
          <Box className="h-12 w-12 text-muted mx-auto mb-4" />
          <h3 className="text-lg font-bold">No Capacity Rules Configured</h3>
          <p className="text-sm text-muted mt-1 mb-6">
            Setup limits at the event level, specific rooms, or breakout sessions.
          </p>
          <Button onClick={openCreateModal} className="bg-[var(--pri)] font-bold">
            Create First Rule
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {statuses.map((status) => {
            const percentage = Math.round(status.occupancy_rate * 100);
            const isNearCapacity = status.occupancy_rate >= 0.9;
            const isFull = status.occupancy_rate >= 1.0;

            let badgeColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
            let progressColor = "bg-emerald-500";
            if (isFull) {
              badgeColor = "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse";
              progressColor = "bg-rose-500";
            } else if (isNearCapacity) {
              badgeColor = "bg-amber-500/10 text-amber-400 border-amber-500/20";
              progressColor = "bg-amber-500";
            }

            return (
              <motion.div
                key={status.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative rounded-2xl border border-default bg-[var(--surf)]/20 p-5 glass-3d flex flex-col justify-between overflow-hidden group hover:border-[var(--pri)]/40 transition-all duration-300"
              >
                {/* Visual Glass highlights */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--pri)]/5 blur-2xl rounded-full pointer-events-none" />

                <div className="space-y-4">
                  {/* Top section */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase font-extrabold tracking-widest text-muted">
                      {status.level} level
                    </span>
                    <span className={`text-[10px] uppercase font-bold border px-2 py-0.5 rounded-full ${badgeColor}`}>
                      {isFull ? "Full" : isNearCapacity ? "Warning" : "Optimal"}
                    </span>
                  </div>

                  {/* Level title */}
                  <div>
                    <h3 className="text-lg font-black tracking-tight leading-tight line-clamp-1">
                      {status.target_name}
                    </h3>
                  </div>

                  {/* Progress Gauge */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-muted">Occupancy rate</span>
                      <span>{percentage}%</span>
                    </div>
                    <div className="h-2 w-full bg-background rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(percentage, 100)}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className={`h-full ${progressColor}`}
                      />
                    </div>
                  </div>

                  {/* Counters */}
                  <div className="grid grid-cols-3 gap-2 bg-background/30 p-2.5 rounded-xl border border-default text-center">
                    <div>
                      <div className="text-xs text-muted font-semibold">Active</div>
                      <div className="text-base font-black text-[var(--text)]">{status.current_occupancy}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted font-semibold">Capacity</div>
                      <div className="text-base font-black text-[var(--text)]">{status.capacity}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted font-semibold">Waitlist</div>
                      <div className="text-base font-black text-indigo-400">{status.waitlist_count}</div>
                    </div>
                  </div>
                </div>

                {/* Lower Action buttons */}
                <div className="flex items-center justify-between mt-5 pt-3 border-t border-default/50">
                  <div className="text-xs text-muted font-semibold flex items-center gap-1">
                    {status.waitlist_count > 0 ? (
                      <span className="text-indigo-400 flex items-center gap-1">
                        <Users className="h-3 w-3" /> Waitlisted attendees
                      </span>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Seats Available
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditModal(status)}
                      className="h-8 w-8 p-0 text-muted hover:text-white"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {ruleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md bg-[var(--surf)] border border-default p-6 rounded-2xl glass-3d space-y-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Box className="h-5 w-5 text-[var(--pri)]" />
                {selectedStatus ? "Modify Capacity Limit" : "New Capacity Policy"}
              </h2>
              <button 
                onClick={() => setRuleModalOpen(false)}
                className="text-muted hover:text-white"
              >
                <XCircleIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Level selection */}
              {!selectedStatus && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">Policy Level</label>
                  <select
                    value={level}
                    onChange={(e) => {
                      setLevel(e.target.value as any);
                      setTargetId("");
                    }}
                    className="w-full rounded-md bg-background/50 border border-default p-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--pri)] text-white"
                  >
                    <option value="event" className="bg-[var(--surf)]">Event Intake</option>
                    <option value="room" className="bg-[var(--surf)]">Specific Room</option>
                    <option value="session" className="bg-[var(--surf)]">Specific Session</option>
                  </select>
                </div>
              )}

              {/* Target entity selection */}
              {!selectedStatus && level === "room" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">Select Room</label>
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="w-full rounded-md bg-background/50 border border-default p-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--pri)] text-white"
                    required
                  >
                    <option value="">-- Choose Room --</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id} className="bg-[var(--surf)]">{r.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {!selectedStatus && level === "session" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">Select Session</label>
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="w-full rounded-md bg-background/50 border border-default p-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--pri)] text-white"
                    required
                  >
                    <option value="">-- Choose Session --</option>
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id} className="bg-[var(--surf)]">{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {selectedStatus && (
                <div className="bg-background/40 p-3 rounded-lg border border-default text-xs">
                  Target: <strong className="text-[var(--pri)]">{selectedStatus.target_name}</strong> ({selectedStatus.level} level)
                </div>
              )}

              {/* Capacity limit input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">Seat Capacity Limit</label>
                <Input
                  type="number"
                  value={capacity}
                  onChange={(e) => setCapacity(parseInt(e.target.value) || 0)}
                  placeholder="Maximum allowed attendees"
                  className="bg-background/50 border-default focus-visible:ring-[var(--pri)]"
                />
              </div>

              {/* Toggles */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Enable Waitlist</div>
                    <div className="text-xs text-muted">Hold submissions in queue when capacity limit is reached.</div>
                  </div>
                  <button 
                    onClick={() => setWaitlistEnabled(!waitlistEnabled)}
                    className="text-[var(--pri)] hover:opacity-80 transition-opacity"
                  >
                    {waitlistEnabled ? (
                      <ToggleRight className="h-8 w-8 text-[var(--pri)]" />
                    ) : (
                      <ToggleLeft className="h-8 w-8 text-muted" />
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Auto-Promote (FIFO)</div>
                    <div className="text-xs text-muted">Automatically promote waitlisted users if seats free up.</div>
                  </div>
                  <button 
                    onClick={() => setAutoPromote(!autoPromote)}
                    className="text-[var(--pri)] hover:opacity-80 transition-opacity"
                  >
                    {autoPromote ? (
                      <ToggleRight className="h-8 w-8 text-[var(--pri)]" />
                    ) : (
                      <ToggleLeft className="h-8 w-8 text-muted" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setRuleModalOpen(false)}
                className="glass-3d"
              >
                Cancel
              </Button>
              <Button
                onClick={submitRule}
                className="bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-white font-bold"
              >
                Save Policy
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// Minimal missing icon
function XCircleIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}
