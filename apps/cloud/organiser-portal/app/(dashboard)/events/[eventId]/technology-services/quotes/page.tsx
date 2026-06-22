"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { 
  ClipboardList, Search, CheckCircle, Clock, ShieldAlert, Sparkles, X, 
  Banknote, Award, CheckCircle2, AlertCircle, RefreshCw, MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";

interface QuoteItem {
  name: string;
  category: "Hardware" | "Labor" | "Network" | "Admin";
  unit_price: number;
  qty: number;
}

interface Quote {
  id: string;
  quote_number: string;
  request_number: string;
  request_title: string;
  items: QuoteItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  status: "AWAITING_APPROVAL" | "APPROVED" | "REVISION_REQUESTED";
  created_at: string;
  operator_notes: string;
  revision_feedback?: string;
}

export default function QuotesPage() {
  const { eventId } = useParams();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedbackText, setFeedbackText] = useState("");
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      setQuotes([
        {
          id: "q1",
          quote_number: "QTE-20260622-0091",
          request_number: "REQ-20260622-0001",
          request_title: "Main Room Presentation Streaming Setup",
          items: [
            { name: "Bonded Cellular Encoders Leasing", category: "Hardware", unit_price: 350, qty: 1 },
            { name: "High Bandwidth Port Uplink Provisioning", category: "Network", unit_price: 250, qty: 2 },
            { name: "Streaming Production Crew Labor Hours", category: "Labor", unit_price: 85, qty: 12 },
            { name: "System Setup and Routing Administrative Fee", category: "Admin", unit_price: 150, qty: 1 }
          ],
          subtotal: 1770,
          discount: 100,
          tax: 133.6,
          total: 1803.6,
          status: "AWAITING_APPROVAL",
          created_at: "2026-06-22T09:00:00Z",
          operator_notes: "Includes redundancy on dual multi-carrier routers. Labor covers setup, rehearsals, and live monitoring of main keynote."
        },
        {
          id: "q2",
          quote_number: "QTE-20260622-0092",
          request_number: "REQ-20260622-0002",
          request_title: "Speaker Ready Room Presentation Preview Stations",
          items: [
            { name: "High-spec Preview Station Laptop", category: "Hardware", unit_price: 120, qty: 4 },
            { name: "Central Speaker DB Sync Server", category: "Hardware", unit_price: 250, qty: 1 },
            { name: "Speaker Services Operator Labor Hours", category: "Labor", unit_price: 75, qty: 8 }
          ],
          subtotal: 1330,
          discount: 0,
          tax: 106.4,
          total: 1436.4,
          status: "APPROVED",
          created_at: "2026-06-22T10:10:00Z",
          operator_notes: "Approved automatically under Bronze tier agreement. Hardware reservation confirmed."
        }
      ]);
      setLoading(false);
    }, 500);
  }, [eventId]);

  const handleApprove = (quoteId: string) => {
    setQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, status: "APPROVED" } : q));
    setSelectedQuote(prev => prev && prev.id === quoteId ? { ...prev, status: "APPROVED" } : prev);
  };

  const handleRequestRevision = () => {
    if (!selectedQuote || !feedbackText.trim()) return;
    const quoteId = selectedQuote.id;
    setQuotes(prev => prev.map(q => q.id === quoteId ? { 
      ...q, 
      status: "REVISION_REQUESTED", 
      revision_feedback: feedbackText 
    } : q));
    setSelectedQuote(prev => prev && prev.id === quoteId ? { 
      ...prev, 
      status: "REVISION_REQUESTED", 
      revision_feedback: feedbackText 
    } : prev);
    setFeedbackText("");
    setIsRevisionModalOpen(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "APPROVED":
        return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "REVISION_REQUESTED":
        return "bg-rose-500/10 text-rose-500 border-rose-500/20";
      default:
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    }
  };

  return (
    <div className="p-6 space-y-8 h-full overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] text-glow-indigo">
            Commercial <span className="text-[var(--sec)]">Quotes</span>
          </h1>
          <p className="text-muted font-bold text-xs uppercase tracking-[0.2em] opacity-80">
            Review detailed estimates, request modifications, and authorize operations budgets
          </p>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-8 overflow-hidden min-h-0">
        {/* Quotes List Column */}
        <div className="lg:col-span-2 flex flex-col space-y-4 overflow-hidden h-full">
          <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
            {loading ? (
              <div className="flex h-48 items-center justify-center">
                <p className="text-muted text-xs font-black uppercase tracking-widest animate-pulse">Loading quotes database...</p>
              </div>
            ) : quotes.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-default rounded-3xl">
                <p className="text-xs text-muted font-bold">No active quotes available.</p>
              </div>
            ) : (
              quotes.map((q, idx) => (
                <motion.div
                  key={q.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => setSelectedQuote(q)}
                  className={`p-6 rounded-3xl border cursor-pointer transition-all duration-300 ${
                    selectedQuote?.id === q.id 
                      ? "bg-[var(--pri)]/5 border-[var(--pri)]/40 shadow-lg" 
                      : "bg-[var(--card)]/30 border-default hover:border-[var(--muted)]/50"
                  }`}
                >
                  <div className="flex justify-between items-start gap-4 mb-3">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-muted tracking-widest uppercase">{q.quote_number}</span>
                      <h3 className="text-xs font-black text-[var(--text)] tracking-tight uppercase">{q.request_title}</h3>
                    </div>
                    <Badge className={`border px-2 py-0.5 text-[8px] font-black tracking-wider uppercase rounded-lg ${getStatusBadge(q.status)}`}>
                      {q.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center mt-4">
                    <div className="flex items-center gap-1 text-[var(--pri)]">
                      <Banknote className="h-4 w-4" />
                      <span className="text-sm font-black">${q.total.toLocaleString()}</span>
                    </div>
                    <span className="text-[9px] font-bold text-muted uppercase">Req Ref: {q.request_number}</span>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Quote Details Column */}
        <div className="lg:col-span-3 overflow-hidden h-full flex flex-col">
          {selectedQuote ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-3d p-8 rounded-[2.5rem] border-default flex-1 overflow-y-auto custom-scrollbar flex flex-col justify-between"
            >
              <div className="space-y-6">
                <div className="flex justify-between items-start pb-4 border-b border-default/50">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-muted tracking-widest uppercase">{selectedQuote.quote_number}</span>
                    <h2 className="text-base font-black text-[var(--text)] tracking-tight leading-tight uppercase">{selectedQuote.request_title}</h2>
                    <p className="text-[9px] font-bold text-muted uppercase">Linked to {selectedQuote.request_number}</p>
                  </div>
                  <Badge className={`border px-3 py-1 text-[9px] font-black tracking-widest uppercase rounded-lg ${getStatusBadge(selectedQuote.status)}`}>
                    {selectedQuote.status.replace("_", " ")}
                  </Badge>
                </div>

                {/* Operator Note */}
                <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-1">
                  <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Technical Operator Note
                  </span>
                  <p className="text-[11px] text-[var(--text)] leading-relaxed font-semibold">{selectedQuote.operator_notes}</p>
                </div>

                {/* Quote Items Grid */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-muted uppercase tracking-widest">Pricing Line Items</h4>
                  <div className="space-y-2">
                    {selectedQuote.items.map((item, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-[var(--card)]/40 border border-default flex justify-between items-center text-xs">
                        <div className="space-y-1">
                          <p className="text-[11px] font-black text-[var(--text)]">{item.name}</p>
                          <Badge variant="outline" className="border-default text-[8px] uppercase tracking-wider font-extrabold text-muted">
                            {item.category}
                          </Badge>
                        </div>
                        <div className="text-right font-black">
                          <p className="text-[11px] text-[var(--text)]">${item.unit_price} x {item.qty}</p>
                          <p className="text-[10px] text-[var(--pri)]">${(item.unit_price * item.qty).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Calculations summary */}
                <div className="p-5 rounded-2xl bg-[var(--card)]/20 border border-default/60 space-y-2 text-xs font-bold text-muted">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="text-[var(--text)]">${selectedQuote.subtotal.toLocaleString()}</span>
                  </div>
                  {selectedQuote.discount > 0 && (
                    <div className="flex justify-between text-emerald-500">
                      <span>Discount (SLA Rebate)</span>
                      <span>-${selectedQuote.discount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Est. Service Tax (8%)</span>
                    <span className="text-[var(--text)]">${selectedQuote.tax.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-t border-default/60 pt-2 text-sm font-black text-[var(--text)]">
                    <span>Final Quote Total</span>
                    <span className="text-[var(--pri)]">${selectedQuote.total.toLocaleString()}</span>
                  </div>
                </div>

                {selectedQuote.revision_feedback && (
                  <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 text-[11px] space-y-1">
                    <p className="font-black text-rose-500 uppercase tracking-wider">YOUR REVISION FEEDBACK</p>
                    <p className="text-muted leading-relaxed font-semibold">{selectedQuote.revision_feedback}</p>
                  </div>
                )}
              </div>

              {selectedQuote.status === "AWAITING_APPROVAL" && (
                <div className="pt-6 border-t border-default/50 flex gap-3 mt-6">
                  <Button 
                    onClick={() => handleApprove(selectedQuote.id)}
                    className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest rounded-full hover-lift-3d"
                  >
                    Authorize & Approve
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => setIsRevisionModalOpen(true)}
                    className="flex-1 h-12 border-default font-black text-[10px] uppercase tracking-widest rounded-full hover:bg-rose-500/10 hover:text-rose-500 transition"
                  >
                    Request Revision
                  </Button>
                </div>
              )}
            </motion.div>
          ) : (
            <div className="flex-1 rounded-[2.5rem] border border-dashed border-default flex flex-col items-center justify-center text-center p-8 bg-[var(--card)]/10">
              <Banknote className="h-12 w-12 text-muted mb-4 opacity-50" />
              <p className="text-sm font-black text-[var(--text)] tracking-tight uppercase tracking-wider">Select a Quote</p>
              <p className="text-xs text-muted max-w-[200px] leading-relaxed mt-2">Choose any estimate quote from the list to view the itemized hardware, labor billing, and signoff approval options.</p>
            </div>
          )}
        </div>
      </div>

      {/* Request Revision Modal */}
      <AnimatePresence>
        {isRevisionModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-3d w-full max-w-md rounded-[2.5rem] border border-default/60 overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-default flex justify-between items-center bg-[var(--card)]/40">
                <h3 className="text-sm font-black text-[var(--text)] uppercase tracking-wider">Request Quote Revision</h3>
                <button 
                  onClick={() => setIsRevisionModalOpen(false)} 
                  className="h-8 w-8 rounded-full border border-default flex items-center justify-center hover:bg-[var(--card)] transition"
                >
                  <X className="h-4 w-4 text-muted" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-xs text-muted font-bold leading-normal">
                  Explain what adjustments are needed (e.g. reduction in labor hours, different equipment models, or alternative setup timeframes).
                </p>
                <textarea 
                  rows={4}
                  placeholder="Type your review comments here..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  className="w-full p-3 bg-background/50 border border-default rounded-xl font-semibold text-xs text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--pri)]"
                />
              </div>

              <div className="p-6 border-t border-default bg-[var(--card)]/20 flex gap-3">
                <Button 
                  onClick={handleRequestRevision}
                  disabled={!feedbackText.trim()}
                  className="flex-1 h-11 bg-rose-600 hover:bg-rose-700 text-white font-black text-[10px] uppercase tracking-widest rounded-full"
                >
                  Submit Review Comments
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setIsRevisionModalOpen(false)}
                  className="h-11 border-default font-black text-[10px] uppercase tracking-widest rounded-full"
                >
                  Cancel
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
