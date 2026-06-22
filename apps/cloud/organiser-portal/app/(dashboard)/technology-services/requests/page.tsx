"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { 
  Layers, CheckCircle, Clock, Plus, HelpCircle, ArrowRight,
  Wifi, HardDrive, Cpu, ShieldAlert, BadgeInfo
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";

export default function TechnologyServicesRequests() {
  const { eventId } = useParams();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);

  // Form State
  const [bandwidth, setBandwidth] = useState("100 Mbps");
  const [ssid, setSsid] = useState("");
  const [badgeVolume, setBadgeVolume] = useState("500");
  const [avNeeds, setAvNeeds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    // Seed initial requests
    const timer = setTimeout(() => {
      setRequests([
        { 
          id: "req-101", 
          title: "Primary Keynote Internet Link", 
          category: "NETWORK", 
          specs: { bandwidth: "1 Gbps Dedicated Fiber", ssid: "Keynote-Ultra" }, 
          status: "APPROVED", 
          submittedAt: "2026-06-20" 
        },
        { 
          id: "req-102", 
          title: "Attendee Registration Badge Printers", 
          category: "HARDWARE", 
          specs: { volume: "1,500 delegates", printers: "6x Thermal Label" }, 
          status: "IN_PROGRESS", 
          submittedAt: "2026-06-21" 
        },
        { 
          id: "req-103", 
          title: "Dante Audio Rig and Lapels", 
          category: "AUDIO_VISUAL", 
          specs: { wirelessMics: "4x Lapels", console: "Yamaha CL5" }, 
          status: "PENDING", 
          submittedAt: "2026-06-22" 
        }
      ]);
      setLoading(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [eventId]);

  const toggleAvNeed = (need: string) => {
    setAvNeeds(prev => 
      prev.includes(need) ? prev.filter(n => n !== need) : [...prev, need]
    );
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newRequest = {
      id: `req-${100 + requests.length + 1}`,
      title: ssid ? `Wi-Fi Provisioning: ${ssid}` : `Tech Services Specs Request`,
      category: avNeeds.length > 0 ? "AUDIO_VISUAL" : "NETWORK",
      specs: {
        bandwidth,
        ssid: ssid || "Default-SSID",
        badgeVolume,
        avSetup: avNeeds.join(", ")
      },
      status: "PENDING",
      submittedAt: new Date().toISOString().split("T")[0]
    };

    setRequests(prev => [newRequest, ...prev]);
    setShowWizard(false);
    // Reset Form
    setStep(1);
    setBandwidth("100 Mbps");
    setSsid("");
    setBadgeVolume("500");
    setAvNeeds([]);
    setNotes("");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "APPROVED":
        return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Approved</Badge>;
      case "IN_PROGRESS":
        return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">Planning</Badge>;
      case "PENDING":
        return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">Pending Review</Badge>;
      default:
        return <Badge className="bg-zinc-500/10 text-zinc-400 border-zinc-500/20">Draft</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex h-[75vh] items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <Clock className="h-10 w-10 animate-spin text-indigo-500" />
          <p className="text-zinc-500 text-xs font-black uppercase tracking-widest">Loading Requests Queue...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-8 pb-16 overflow-y-auto h-full custom-scrollbar">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            Requirements <span className="bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">& Requests</span>
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Build technical spec configurations and triage requests queue
          </p>
        </div>
        <Button 
          onClick={() => setShowWizard(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2.5 rounded-lg flex items-center gap-2 hover:scale-[1.02] transition-all"
        >
          <Plus className="h-4 w-4" /> New Spec Wizard
        </Button>
      </div>

      {/* Main Grid: Queue & Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Requests Queue */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Layers className="text-indigo-400 h-5 w-5" /> Submitted Specifications
          </h2>
          
          <div className="space-y-4">
            {requests.map(req => (
              <div 
                key={req.id} 
                className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md hover:border-zinc-700/50 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-500 text-xs font-bold font-mono tracking-wider">{req.id}</span>
                    <h3 className="text-md font-bold text-white">{req.title}</h3>
                    <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700/50 text-[10px] uppercase font-bold tracking-wider">{req.category}</Badge>
                  </div>
                  
                  {/* Spec Specs detail line */}
                  <div className="text-xs text-zinc-400 flex flex-wrap gap-x-4 gap-y-1">
                    {Object.entries(req.specs).map(([key, val]: any) => (
                      <span key={key} className="flex items-center gap-1.5 bg-zinc-900/60 px-2 py-0.5 rounded border border-zinc-800/50">
                        <span className="text-zinc-500 font-bold font-mono">{key}:</span>
                        <span className="text-zinc-300 font-semibold">{val}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 border-zinc-800/50 pt-3 md:pt-0">
                  <span className="text-xs text-zinc-500 font-medium">Submitted {req.submittedAt}</span>
                  {getStatusBadge(req.status)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Requirements gathering info card */}
        <div className="space-y-6">
          <div className="p-8 rounded-2xl bg-zinc-900/30 border border-zinc-800/40 backdrop-blur-md space-y-6">
            <h3 className="text-md font-black text-white uppercase tracking-wider flex items-center gap-2">
              <BadgeInfo className="text-indigo-400 h-5 w-5" /> Spec Requirements Guide
            </h3>
            <div className="space-y-4 text-xs text-zinc-400 leading-relaxed">
              <div className="space-y-1">
                <div className="font-bold text-zinc-300">Bandwidth allocations</div>
                <p>Standard Wi-Fi supports up to 500 delegates. Dedicated high-performance fiber links are required for keynote streaming or live workshop rooms.</p>
              </div>
              <div className="space-y-1">
                <div className="font-bold text-zinc-300">A/V Hardware Dante Sound</div>
                <p>Ensure high fidelity Dante routing if connecting dual room systems or integrating with venue audio feeds.</p>
              </div>
              <div className="space-y-1">
                <div className="font-bold text-zinc-300">Badge Printer volume</div>
                <p>Estimate badge volumes based on pre-registration. One printer handles roughly 250 print jobs hourly without delays.</p>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Interactive Spec Wizard Modal */}
      <AnimatePresence>
        {showWizard && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-950 border border-zinc-800/80 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-zinc-800/80 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">Technical Requirements Builder</h3>
                  <p className="text-zinc-500 text-xs mt-0.5">Step {step} of 3 — Specifying technical targets</p>
                </div>
                <Button 
                  onClick={() => setShowWizard(false)}
                  variant="ghost" 
                  className="hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg h-8 w-8 p-0"
                >
                  &times;
                </Button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleFormSubmit} className="p-6 overflow-y-auto flex-1 space-y-6">
                {step === 1 && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">Step 1: Network & Wi-Fi Provisioning</h4>
                    <div className="space-y-2">
                      <label className="text-xs text-zinc-400 font-bold uppercase">Dedicated Bandwidth</label>
                      <select 
                        value={bandwidth} 
                        onChange={(e) => setBandwidth(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="100 Mbps">100 Mbps (Standard Meeting)</option>
                        <option value="500 Mbps">500 Mbps (Streaming Live)</option>
                        <option value="1 Gbps Dedicated">1 Gbps Dedicated Fiber (Keynotes)</option>
                        <option value="Custom Fiber Line">Custom Managed Solution</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-zinc-400 font-bold uppercase">SSID Broadcast Name</label>
                      <input 
                        type="text" 
                        placeholder="e.g. EventX-Keynote"
                        value={ssid} 
                        onChange={(e) => setSsid(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">Step 2: Badging & Registration Volume</h4>
                    <div className="space-y-2">
                      <label className="text-xs text-zinc-400 font-bold uppercase">Estimated Badge Print Volume</label>
                      <select 
                        value={badgeVolume} 
                        onChange={(e) => setBadgeVolume(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="500">Up to 500 delegates</option>
                        <option value="1500">500 to 1,500 delegates</option>
                        <option value="3000">1,500 to 3,000 delegates</option>
                        <option value="5000">Enterprise Scale (3,000+)</option>
                      </select>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">Step 3: Audio/Video & Details</h4>
                    <div className="space-y-2">
                      <label className="text-xs text-zinc-400 font-bold uppercase block mb-1">Keynote Stage Rig AV Needs</label>
                      <div className="grid grid-cols-2 gap-3">
                        {["Wireless Lapels", "Stage Spotlights", "4K Video Mixer", "Projector Rig", "Dante Audio Sync", "Background LED Wall"].map(need => (
                          <div 
                            key={need}
                            onClick={() => toggleAvNeed(need)}
                            className={`p-3 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${
                              avNeeds.includes(need) 
                                ? "bg-indigo-600/10 border-indigo-500 text-indigo-400" 
                                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                            }`}
                          >
                            {need}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 pt-2">
                      <label className="text-xs text-zinc-400 font-bold uppercase">Special Operational Notes</label>
                      <textarea 
                        rows={3} 
                        placeholder="Detail any power grid issues or scheduling constraints..."
                        value={notes} 
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </form>

              {/* Modal Footer */}
              <div className="p-6 border-t border-zinc-800/80 bg-zinc-900/10 flex justify-between">
                <Button 
                  disabled={step === 1}
                  onClick={() => setStep(prev => prev - 1)}
                  variant="outline" 
                  className="border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                >
                  Back
                </Button>
                {step < 3 ? (
                  <Button 
                    onClick={() => setStep(prev => prev + 1)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                  >
                    Next
                  </Button>
                ) : (
                  <Button 
                    onClick={handleFormSubmit}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                  >
                    Submit Specification
                  </Button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
