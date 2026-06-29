"use client";

import { useState, useEffect } from "react";
import { 
  FileText, CheckCircle2, AlertCircle, TrendingUp, DollarSign, ArrowRight,
  ShieldCheck, Calculator, Search, Sliders, ChevronDown, Clock, Settings,
  Eye, FileCheck, Layers, EyeOff, Check, X, ShieldAlert, BadgeInfo
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";

interface RequestItem {
  id: string;
  client: string;
  event: string;
  date: string;
  status: "PENDING" | "QUOTED" | "APPROVED" | "REJECTED";
  urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  sla: "Bronze" | "Silver" | "Gold" | "Platinum";
  items: {
    name: string;
    category: string;
    quantity: number;
    baseCost: number;
    quotedPrice: number;
  }[];
}

const mockRequests: RequestItem[] = [
  {
    id: "TS-8041",
    client: "Global Tech Summit Ltd",
    event: "GTS 2026 Keynote & Exhibition",
    date: "June 22, 2026",
    status: "PENDING",
    urgency: "HIGH",
    sla: "Platinum",
    items: [
      { name: "1Gbps Dedicated Fiber Uplink (Redundant)", category: "Networking", quantity: 1, baseCost: 1200, quotedPrice: 2500 },
      { name: "Live 4K RTMP Streaming Server Package", category: "Streaming", quantity: 2, baseCost: 450, quotedPrice: 950 },
      { name: "NFC Badge Printers & Scanner Terminals", category: "Registration", quantity: 10, baseCost: 80, quotedPrice: 150 },
      { name: "Speaker Ready Room Teleprompter System", category: "Speaker Ready", quantity: 1, baseCost: 300, quotedPrice: 600 }
    ]
  },
  {
    id: "TS-8042",
    client: "Fintech Horizon Inc",
    event: "Fintech Horizon annual meet",
    date: "June 23, 2026",
    status: "PENDING",
    urgency: "MEDIUM",
    sla: "Gold",
    items: [
      { name: "500Mbps Dedicated Uplink", category: "Networking", quantity: 1, baseCost: 800, quotedPrice: 1500 },
      { name: "On-site Streaming Video Mixer & Camera Ops", category: "Streaming", quantity: 1, baseCost: 900, quotedPrice: 1800 },
      { name: "Digital Signage Displays (65\" 4K)", category: "Signage", quantity: 8, baseCost: 120, quotedPrice: 220 }
    ]
  },
  {
    id: "TS-8038",
    client: "MedHealth Ventures",
    event: "MedTech Annual Expo",
    date: "June 19, 2026",
    status: "QUOTED",
    urgency: "LOW",
    sla: "Silver",
    items: [
      { name: "300Mbps Event Wi-Fi Hotspot", category: "Networking", quantity: 1, baseCost: 500, quotedPrice: 1000 },
      { name: "Session Room projector & A/V Kit", category: "A/V", quantity: 3, baseCost: 350, quotedPrice: 700 }
    ]
  },
  {
    id: "TS-8035",
    client: "AI Synergy Conference",
    event: "AI Synergy Expo 2026",
    date: "June 18, 2026",
    status: "APPROVED",
    urgency: "CRITICAL",
    sla: "Platinum",
    items: [
      { name: "10Gbps Multi-gig Feed (Dark Fiber)", category: "Networking", quantity: 1, baseCost: 3500, quotedPrice: 8500 },
      { name: "AI Real-time Translation & Captioning", category: "Captioning", quantity: 4, baseCost: 400, quotedPrice: 1200 },
      { name: "NFC Fast-track Gates", category: "Registration", quantity: 6, baseCost: 200, quotedPrice: 500 }
    ]
  }
];

export default function RequestsTriage() {
  const [requests, setRequests] = useState<RequestItem[]>(mockRequests);
  const [selectedId, setSelectedId] = useState<string>("TS-8041");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const selectedRequest = requests.find(r => r.id === selectedId) || requests[0];

  // Calculate gross margins for selected request
  const calculateMargin = (req: RequestItem) => {
    let totalCost = 0;
    let totalRevenue = 0;
    req.items.forEach(item => {
      totalCost += item.baseCost * item.quantity;
      totalRevenue += item.quotedPrice * item.quantity;
    });
    const profit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
    return { totalCost, totalRevenue, profit, margin };
  };

  const handlePriceChange = (itemIdx: number, newPrice: number) => {
    setRequests(prev => prev.map(req => {
      if (req.id === selectedId) {
        const updatedItems = [...req.items];
        updatedItems[itemIdx] = { ...updatedItems[itemIdx], quotedPrice: newPrice };
        return { ...req, items: updatedItems };
      }
      return req;
    }));
  };

  const handleStatusChange = (status: "PENDING" | "QUOTED" | "APPROVED" | "REJECTED") => {
    setRequests(prev => prev.map(req => {
      if (req.id === selectedId) {
        return { ...req, status };
      }
      return req;
    }));
  };

  const filteredRequests = requests.filter(req => {
    const matchesSearch = 
      req.client.toLowerCase().includes(searchQuery.toLowerCase()) || 
      req.event.toLowerCase().includes(searchQuery.toLowerCase()) || 
      req.id.includes(searchQuery);
    
    if (statusFilter === "ALL") return matchesSearch;
    return matchesSearch && req.status === statusFilter;
  });

  const activeStats = calculateMargin(selectedRequest);

  return (
    <div className="space-y-6 p-8 pb-16 overflow-y-auto h-full custom-scrollbar">
      {/* Title section */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-white">
            Requests <span className="bg-gradient-to-r from-violet-400 to-indigo-500 bg-clip-text text-transparent">Triage Desk</span>
          </h1>
          <p className="text-zinc-400 text-sm">
            Review technology catalogs, build pricing structures, and evaluate gross profit margins.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800">
            <Sliders className="h-4 w-4 mr-2 text-indigo-400" /> Catalog Configurator
          </Button>
        </div>
      </div>

      {/* Main split dashboard panel */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Left Side: Spec Tickets List (5 cols) */}
        <div className="xl:col-span-5 space-y-4">
          <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-md">
            <CardHeader className="pb-3 border-b border-zinc-900">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-black uppercase tracking-wider text-zinc-300">Spec Requests Queue</CardTitle>
                <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700">{filteredRequests.length} Requests</Badge>
              </div>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <Input
                  placeholder="Search clients, events..."
                  className="pl-9 bg-zinc-900/60 border-zinc-800 text-xs text-white focus-visible:ring-indigo-500"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex gap-2 mt-2">
                {["ALL", "PENDING", "QUOTED", "APPROVED"].map(st => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-md transition-all ${
                      statusFilter === st 
                        ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30" 
                        : "bg-zinc-900/30 text-zinc-500 border border-transparent hover:text-zinc-300"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0 max-h-[580px] overflow-y-auto custom-scrollbar">
              <div className="divide-y divide-zinc-900/50">
                {filteredRequests.map(req => {
                  const stats = calculateMargin(req);
                  const isSelected = req.id === selectedId;
                  return (
                    <div
                      key={req.id}
                      onClick={() => setSelectedId(req.id)}
                      className={`p-4 flex flex-col gap-2 cursor-pointer transition-all ${
                        isSelected 
                          ? "bg-zinc-900/60 border-l-2 border-indigo-500" 
                          : "hover:bg-zinc-900/20 border-l-2 border-transparent"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-black text-white">{req.id}</span>
                          <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            req.urgency === "CRITICAL" ? "bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse" :
                            req.urgency === "HIGH" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                            req.urgency === "MEDIUM" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" :
                            "bg-zinc-800 text-zinc-400"
                          }`}>
                            {req.urgency}
                          </span>
                        </div>
                        <Badge className={`text-[10px] px-2 py-0.5 ${
                          req.status === "PENDING" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" :
                          req.status === "QUOTED" ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" :
                          req.status === "APPROVED" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                          "bg-zinc-800 text-zinc-500"
                        }`}>
                          {req.status}
                        </Badge>
                      </div>

                      <div>
                        <h4 className="text-xs font-bold text-zinc-200 line-clamp-1">{req.client}</h4>
                        <p className="text-[11px] text-zinc-500 line-clamp-1">{req.event}</p>
                      </div>

                      <div className="flex items-center justify-between mt-1 pt-2 border-t border-zinc-900/40 text-[10px] font-medium text-zinc-500">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> SLA: <b className="text-zinc-400">{req.sla}</b></span>
                        <span className="text-zinc-400 font-bold">${stats.totalRevenue.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Interactive Editor & Calculator (7 cols) */}
        <div className="xl:col-span-7 space-y-6">
          <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-md">
            <CardHeader className="pb-4 border-b border-zinc-900">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-black text-white flex items-center gap-2">
                    <Calculator className="text-indigo-400 h-5 w-5" /> Quote Estimate Workspace
                  </CardTitle>
                  <CardDescription className="text-xs text-zinc-500 mt-1">
                    Calculate profit margins, customize itemized costs, and dispatch estimates.
                  </CardDescription>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">Selected Ticket</span>
                  <div className="font-mono text-sm font-black text-indigo-400">{selectedRequest.id}</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {/* Client Profile and SLA Banner */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-zinc-900/30 border border-zinc-900">
                <div className="space-y-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-500">Customer Event Specs</span>
                  <h3 className="text-sm font-black text-zinc-200">{selectedRequest.client}</h3>
                  <p className="text-xs text-zinc-400">{selectedRequest.event}</p>
                </div>
                <div className="flex flex-col md:items-end justify-center space-y-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-500">Service Level Commitment</span>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-indigo-400" />
                    <span className="text-sm font-black text-zinc-300">{selectedRequest.sla} SLA</span>
                  </div>
                </div>
              </div>

              {/* Live Cost & Margin Calculator Widgets */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/40 space-y-1">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Estimated Revenue</span>
                  <div className="text-xl font-black text-white flex items-center">
                    <DollarSign className="h-4 w-4 text-emerald-400 shrink-0" />
                    {activeStats.totalRevenue.toLocaleString()}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/40 space-y-1">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Base Material Cost (COGS)</span>
                  <div className="text-xl font-black text-zinc-400 flex items-center">
                    <DollarSign className="h-4 w-4 text-zinc-500 shrink-0" />
                    {activeStats.totalCost.toLocaleString()}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/20 space-y-1">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Gross Profit Margin</span>
                  <div className="text-xl font-black text-white flex items-center justify-between">
                    <span className="flex items-center"><DollarSign className="h-4 w-4 text-indigo-400 shrink-0" />{activeStats.profit.toLocaleString()}</span>
                    <Badge className={`text-[10px] ${activeStats.margin >= 50 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                      {activeStats.margin.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Itemized Pricing Form */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Settings className="h-3.5 w-3.5 text-indigo-400" /> Customize Pricing Structure
                </h3>
                <div className="space-y-3">
                  {selectedRequest.items.map((item, idx) => {
                    const itemMargin = item.quotedPrice > 0 ? ((item.quotedPrice - item.baseCost) / item.quotedPrice) * 100 : 0;
                    return (
                      <div 
                        key={idx} 
                        className="p-4 rounded-xl bg-zinc-900/20 border border-zinc-900 space-y-3 hover:border-zinc-800/60 transition-all"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <span className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-wide">{item.category}</span>
                            <h4 className="text-xs font-bold text-zinc-200">{item.name}</h4>
                          </div>
                          <Badge className="bg-zinc-800 text-zinc-400 w-fit self-start">Qty: {item.quantity}</Badge>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-zinc-900/60">
                          <div className="space-y-1">
                            <label className="text-[10px] text-zinc-500 font-bold">Base Unit Cost</label>
                            <div className="text-xs font-mono text-zinc-400 p-2 bg-zinc-950/40 rounded border border-zinc-900">${item.baseCost}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-zinc-400 font-black flex items-center gap-1">Quoted Unit Price</label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-2 text-zinc-500 text-xs">$</span>
                              <Input
                                type="number"
                                className="pl-6 h-8 text-xs bg-zinc-900 border-zinc-800 text-white font-mono"
                                value={item.quotedPrice}
                                onChange={(e) => handlePriceChange(idx, Number(e.target.value))}
                              />
                            </div>
                          </div>
                          <div className="space-y-1 flex flex-col justify-end">
                            <div className="flex items-center justify-between text-[10px] text-zinc-500 font-bold mb-1">
                              <span>Gross Margin</span>
                              <span className={itemMargin >= 50 ? 'text-emerald-400' : 'text-amber-400'}>{itemMargin.toFixed(0)}%</span>
                            </div>
                            <Progress value={itemMargin} className="h-1.5" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
            <CardFooter className="pt-2 pb-6 border-t border-zinc-900 flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                <BadgeInfo className="h-4 w-4 text-indigo-400" /> Ensure gross margin conforms to internal SLA constraints.
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button 
                  onClick={() => handleStatusChange("REJECTED")} 
                  variant="outline" 
                  className="border-zinc-800 text-rose-400 bg-transparent hover:bg-rose-500/10 hover:border-rose-500/20 text-xs py-1 px-3 h-9 flex-1 sm:flex-initial"
                >
                  <X className="h-4 w-4 mr-1.5" /> Reject Spec
                </Button>
                <Button 
                  onClick={() => handleStatusChange(selectedRequest.status === "PENDING" ? "QUOTED" : "APPROVED")} 
                  className="bg-indigo-500 text-white hover:bg-indigo-600 text-xs py-1 px-4 h-9 flex-1 sm:flex-initial"
                >
                  <Check className="h-4 w-4 mr-1.5" /> 
                  {selectedRequest.status === "PENDING" ? "Publish Quote Estimate" : "Approve & Lock Specs"}
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
