"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { 
  Banknote, CheckCircle, RefreshCw, FileText, 
  HelpCircle, AlertTriangle, Printer, Wifi, Video, ArrowUpRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner"; // If sonner isn't installed, we can fall back to standard alert or mock toast

export default function TechnologyServicesQuotes() {
  const { eventId } = useParams();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuotes([
        {
          id: "QT-201",
          title: "Keynote Ballroom Primary Rig Setup",
          status: "PENDING_APPROVAL",
          submittedDate: "2026-06-21",
          items: [
            { id: 1, name: "1 Gbps Dedicated Fiber Sync Link", category: "NETWORK", cost: 1200 },
            { id: 2, name: "6x Thermal Badge Printers (Hire)", category: "HARDWARE", cost: 600 },
            { id: 3, name: "Dante Core Audio DSP & Stage Rigs", category: "AV", cost: 1500 }
          ],
          discount: 200,
          total: 3100
        },
        {
          id: "QT-198",
          title: "Exhibition Hall Secondary Mesh Setup",
          status: "APPROVED",
          submittedDate: "2026-06-18",
          items: [
            { id: 1, name: "Wi-Fi 6 Mesh Coverage Access Points", category: "NETWORK", cost: 800 },
            { id: 2, name: "Backup cellular WAN router", category: "NETWORK", cost: 300 }
          ],
          discount: 0,
          total: 1100
        }
      ]);
      setLoading(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [eventId]);

  const handleApproveQuote = (quoteId: string) => {
    setQuotes(prev => 
      prev.map(q => q.id === quoteId ? { ...q, status: "APPROVED" } : q)
    );
    // Display standard alert or mock notification
    alert(`Quote ${quoteId} approved! Operations team will be notified.`);
  };

  const getStatusBadge = (status: string) => {
    if (status === "APPROVED") {
      return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Approved</Badge>;
    }
    return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">Pending Approval</Badge>;
  };

  const getIconForCategory = (category: string) => {
    switch (category) {
      case "NETWORK":
        return <Wifi className="h-4 w-4 text-blue-400" />;
      case "HARDWARE":
        return <Printer className="h-4 w-4 text-purple-400" />;
      default:
        return <Video className="h-4 w-4 text-pink-400" />;
    }
  };

  if (loading) {
    return (
      <div className="flex h-[75vh] items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="h-10 w-10 animate-spin text-indigo-500" />
          <p className="text-zinc-500 text-xs font-black uppercase tracking-widest">Loading Quotes Desk...</p>
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
            Estimates <span className="bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">& Quotes</span>
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Review detailed cost estimates and sign off on technical specs invoices
          </p>
        </div>
      </div>

      {/* Main Content: Quote Cards */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* Quotes List */}
        <div className="xl:col-span-2 space-y-8">
          {quotes.map(quote => (
            <div 
              key={quote.id} 
              className="p-8 rounded-2xl bg-zinc-900/30 border border-zinc-800/50 backdrop-blur-md space-y-6 hover:border-zinc-700/50 transition-all"
            >
              {/* Card Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-850 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-500 text-xs font-bold font-mono tracking-wider">{quote.id}</span>
                    <h3 className="text-lg font-black text-white">{quote.title}</h3>
                  </div>
                  <p className="text-zinc-500 text-xs">Submitted on {quote.submittedDate}</p>
                </div>
                <div className="flex items-center gap-4">
                  {getStatusBadge(quote.status)}
                </div>
              </div>

              {/* Items Breakdown Table */}
              <div className="space-y-3">
                <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Line Items Details</div>
                <div className="space-y-2.5">
                  {quote.items.map((item: any) => (
                    <div 
                      key={item.id} 
                      className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-850 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-zinc-900 text-zinc-400 border border-zinc-800">
                          {getIconForCategory(item.category)}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-zinc-300">{item.name}</div>
                          <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider mt-0.5">{item.category}</div>
                        </div>
                      </div>
                      <div className="text-sm font-black text-zinc-200">${item.cost.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Calculation */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
                <div className="space-y-0.5">
                  <span className="text-zinc-500 text-xs font-bold uppercase">Estimated Quote Cost</span>
                  {quote.discount > 0 && (
                    <div className="text-[10px] text-emerald-500 font-semibold">Includes discount ${quote.discount}</div>
                  )}
                </div>
                <div className="text-xl font-black text-white">${quote.total.toLocaleString()}</div>
              </div>

              {/* Action Buttons */}
              {quote.status === "PENDING_APPROVAL" && (
                <div className="flex items-center gap-4 pt-2">
                  <Button 
                    onClick={() => handleApproveQuote(quote.id)}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-11 hover:scale-[1.01] transition-all"
                  >
                    Approve Estimate
                  </Button>
                  <Button 
                    variant="outline" 
                    className="flex-1 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white h-11"
                  >
                    Request Modification
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Informational Sidebar */}
        <div className="space-y-6">
          <div className="p-8 rounded-2xl bg-zinc-900/30 border border-zinc-800/40 backdrop-blur-md space-y-4">
            <h3 className="text-md font-bold text-white flex items-center gap-2">
              <AlertTriangle className="text-amber-500 h-5 w-5" /> Revision Guidelines
            </h3>
            <p className="text-zinc-400 text-xs leading-relaxed">
              If the quotation does not match your event budgets or requirements, you can request modifications directly in the portal. A dedicated technical service engineer will get in touch with you within 2 hours.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
}
