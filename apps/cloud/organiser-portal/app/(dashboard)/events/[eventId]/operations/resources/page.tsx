"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { 
  Users, Server, AlertTriangle, CheckCircle, 
  MapPin, Plus, RefreshCw, Plane, Calendar, HelpCircle 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";

export default function ResourceCalendar() {
  const { eventId } = useParams();
  const [loading, setLoading] = useState(true);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [travelPlans, setTravelPlans] = useState<any[]>([]);
  const [showConflictOnly, setShowConflictOnly] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      setAllocations([
        { id: "a1", name: "Ananya Sharma", type: "STAFF", role: "AV Tech Lead", status: "ALLOCATED", dates: "2026-06-22 to 2026-06-27" },
        { id: "a2", name: "Wireless Lapel Microphone", type: "EQUIPMENT", model: "Shure SLX-D", quantity: 2, status: "ALLOCATED", dates: "2026-06-22 to 2026-06-27" },
        { id: "a3", name: "Rahul Verma", type: "STAFF", role: "Streaming Engineer", status: "CONFLICT", dates: "2026-06-22 to 2026-06-24", conflictReason: "Rahul allocated > 100% on concurrent Event: Tech Summit (120% total)" },
        { id: "a4", name: "Self-Service badge printer", type: "EQUIPMENT", model: "Zebra ZD620", quantity: 6, status: "CONFLICT", dates: "2026-06-22 to 2026-06-27", conflictReason: "Requested quantity (6) exceeds total available stock (5)" }
      ]);

      setTravelPlans([
        { id: "tp1", employee: "Ananya Sharma", city: "Mumbai", hotel: "JW Marriott", status: "BOOKED", arrival: "2026-06-21", departure: "2026-06-27" },
        { id: "tp2", employee: "Rahul Verma", city: "Mumbai", hotel: "Grand Hyatt", status: "PLANNED", arrival: "2026-06-21", departure: "2026-06-24" }
      ]);
      setLoading(false);
    }, 700);
  }, [eventId]);

  const handleResolveConflict = (id: string) => {
    // Mock conflict resolution
    setAllocations(prev => prev.map(a => {
      if (a.id === id) {
        if (a.type === "STAFF") {
          return { ...a, status: "ALLOCATED", dates: "2026-06-22 to 2026-06-24", conflictReason: undefined };
        } else {
          return { ...a, status: "ALLOCATED", quantity: 4, conflictReason: undefined };
        }
      }
      return a;
    }));
  };

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <p className="text-muted text-xs font-bold uppercase tracking-widest animate-pulse">Loading Resource Scheduler...</p>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    if (status === "CONFLICT") return "bg-rose-500/10 text-rose-500 border-rose-500/20";
    return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
  };

  const filteredAllocations = showConflictOnly 
    ? allocations.filter(a => a.status === "CONFLICT") 
    : allocations;

  return (
    <div className="p-6 space-y-8 h-full overflow-y-auto custom-scrollbar pb-12">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] text-glow-indigo">
            Resource <span className="text-[var(--sec)]">Planning Calendar</span>
          </h1>
          <p className="text-muted font-bold text-xs uppercase tracking-[0.2em] opacity-80">
            Allocate crews, schedule physical inventory, and manage travel itineraries
          </p>
        </div>
        <div className="flex gap-3">
          <Button 
            variant="outline"
            onClick={() => setShowConflictOnly(prev => !prev)}
            className={`h-11 px-5 border-default rounded-xl font-bold text-[11px] uppercase tracking-wider ${showConflictOnly ? "bg-rose-500/10 border-rose-500/30 text-rose-500" : ""}`}
          >
            {showConflictOnly ? "Show All Resources" : "Filter Conflicts Only"}
          </Button>
          <Button className="h-11 px-6 bg-[var(--pri)] hover:bg-[var(--sec)] text-white font-black uppercase tracking-widest text-[11px] rounded-full hover-lift-3d">
            <Plus className="mr-2 h-4 w-4" /> Allocate Resource
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Allocations Table */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-3d p-6 rounded-[2rem] border-default space-y-6">
            <div className="flex items-center justify-between border-b border-default pb-4">
              <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-wider">Allocations & Schedule</h3>
              <Badge variant="outline" className="border-default text-[10px] font-black">{filteredAllocations.length} Active</Badge>
            </div>

            <div className="space-y-4">
              <AnimatePresence>
                {filteredAllocations.map((a, idx) => (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`p-5 rounded-2xl border flex flex-col space-y-3 transition-colors ${
                      a.status === "CONFLICT" ? "bg-rose-500/5 border-rose-500/20" : "bg-[var(--card)]/30 border-default"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default flex items-center justify-center shrink-0">
                          {a.type === "STAFF" ? <Users className="h-5 w-5 text-[var(--pri)]" /> : <Server className="h-5 w-5 text-[var(--sec)]" />}
                        </div>
                        <div className="space-y-0.5">
                          <h4 className="text-xs font-black text-[var(--text)]">{a.name}</h4>
                          <p className="text-[10px] text-muted font-semibold uppercase tracking-wider">
                            {a.type === "STAFF" ? a.role : a.model} {a.quantity && `(Qty: ${a.quantity})`}
                          </p>
                        </div>
                      </div>
                      <Badge className={`border-0 rounded-lg text-[8px] font-black tracking-widest px-2 py-0.5 uppercase ${getStatusBadge(a.status)}`}>
                        {a.status}
                      </Badge>
                    </div>

                    <div className="flex justify-between items-center text-[9px] font-black text-muted uppercase tracking-wider">
                      <span>Schedule: {a.dates}</span>
                      {a.status === "CONFLICT" ? (
                        <Button 
                          onClick={() => handleResolveConflict(a.id)}
                          className="h-7 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[9px] font-bold uppercase tracking-wider"
                        >
                          Auto Resolve
                        </Button>
                      ) : (
                        <span className="text-emerald-500">Verified</span>
                      )}
                    </div>

                    {a.conflictReason && (
                      <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-rose-400 font-bold leading-normal">{a.conflictReason}</p>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Travel Plans */}
        <div className="space-y-6">
          <div className="glass-3d p-6 rounded-[2rem] border-default space-y-6">
            <div className="flex items-center justify-between border-b border-default pb-4">
              <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-wider">Travel & Hotel Plans</h3>
              <Plane className="h-5 w-5 text-[var(--pri)]" />
            </div>

            <div className="space-y-4">
              {travelPlans.map((tp, idx) => (
                <div key={tp.id} className="p-4 rounded-xl bg-[var(--card)]/40 border border-default space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-black text-[var(--text)]">{tp.employee}</h4>
                      <p className="text-[9px] text-muted font-bold uppercase tracking-wider">Destination: {tp.city}</p>
                    </div>
                    <Badge variant="outline" className={`border-default text-[8px] font-black tracking-wider uppercase rounded-lg ${tp.status === "BOOKED" ? "text-emerald-500 border-emerald-500/20" : "text-amber-500 border-amber-500/20"}`}>
                      {tp.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted font-semibold">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{tp.hotel}</span>
                  </div>
                  <div className="text-[9px] font-black text-muted uppercase tracking-wider">
                    {tp.arrival} to {tp.departure}
                  </div>
                </div>
              ))}
            </div>

            <Button variant="outline" className="w-full h-11 border-default bg-[var(--card)]/40 hover-lift-2d text-[10px] font-black uppercase tracking-widest">
              <Plus className="mr-2 h-3.5 w-3.5" /> Plan Travel Itinerary
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
