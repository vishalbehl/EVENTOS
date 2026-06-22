"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  ClipboardList, Search, Plus, Filter, Eye, CheckCircle, 
  ArrowUpRight, Clock, ShieldAlert, Sparkles, X, ChevronRight,
  Laptop, Wifi, Tv, HelpCircle, HardDrive, ShieldCheck, Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/store/useUIStore";

interface RequestItem {
  service_name: string;
  quantity: number;
  notes?: string;
}

interface ServiceRequest {
  id: string;
  request_number: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  request_type: string;
  created_at: string;
  items: RequestItem[];
  requirements: Record<string, any>;
}

export default function RequestsPage() {
  const { eventId } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  
  // Wizard state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  
  // Dynamic fields state based on category
  const [dynamicFields, setDynamicFields] = useState<Record<string, any>>({});
  const [itemsList, setItemsList] = useState<RequestItem[]>([]);
  const [newItemName, setNewItemName] = useState("");
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemNotes, setNewItemNotes] = useState("");

  interface FieldSchema {
    name: string;
    label: string;
    type: string;
    default?: any;
    options?: string[];
  }

  const templates: {
    id: string;
    name: string;
    icon: any;
    description: string;
    fields: FieldSchema[];
  }[] = [
    {
      id: "STREAMING",
      name: "Main Stage Audio / Video Streaming",
      icon: Tv,
      description: "Setup bonded encoders, video routing, overlay branding, and network bandwidth allocation for keynotes.",
      fields: [
        { name: "symmetric_mbps", label: "Required Bandwidth (Symmetric Mbps)", type: "number", default: 50 },
        { name: "cameras", label: "Number of Camera Feeds", type: "number", default: 2 },
        { name: "failover_type", label: "Redundancy Failover Type", type: "select", options: ["Bonded Cellular", "Dual ISP WAN", "None"] },
        { name: "stream_destinations", label: "Stream Destinations (comma separated)", type: "text", default: "YouTube Live, Custom RTMP" }
      ]
    },
    {
      id: "SPEAKER_READY",
      name: "Speaker Ready Room Preview Station",
      icon: Laptop,
      description: "Provide presentation upload hubs, preview screens, and automated network sync to podium presentation laptops.",
      fields: [
        { name: "stations", label: "Number of Preview Stations", type: "number", default: 4 },
        { name: "central_server", label: "Use Central Ready Room Synced Database", type: "checkbox", default: true },
        { name: "laptops_provided", label: "Laptops Provided by Venue Operations", type: "checkbox", default: true }
      ]
    },
    {
      id: "REGISTRATION",
      name: "Self-Service Badge Printing Kiosk Setup",
      icon: HardDrive,
      description: "Set up automated badge printing terminals at registration desks with QR code scanning.",
      fields: [
        { name: "kiosks", label: "Number of Printer Kiosks", type: "number", default: 3 },
        { name: "scanners", label: "Number of Handheld QR Scanners", type: "number", default: 4 },
        { name: "kiosk_model", label: "Hardware Model Reference", type: "select", options: ["Zebra ZD620", "Brother QL-820NWB", "Epson TM-T88VI"] }
      ]
    }
  ];

  useEffect(() => {
    // Initial fetch mock
    setTimeout(() => {
      setRequests([
        {
          id: "r1",
          request_number: "REQ-20260622-0001",
          title: "Main Room Presentation Streaming Setup",
          description: "High performance streaming rig, VLAN configuration, and bonded cellular failover.",
          status: "PLANNING",
          priority: "CRITICAL",
          request_type: "STREAMING",
          created_at: "2026-06-22T08:12:00Z",
          items: [
            { service_name: "Streaming Encoder Rig Rental", quantity: 1, notes: "Needs backup power UPS" },
            { service_name: "Bonded Cellular Access Point", quantity: 2, notes: "Requires secondary carrier SIMs" }
          ],
          requirements: { wifi_users: 150, symmetric_mbps: 100, failover_type: "Bonded Cellular" }
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
            { service_name: "Laptops & Hub Interface", quantity: 4, notes: "Pre-load Eventos preview app" }
          ],
          requirements: { stations: 4, central_server: true }
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
            { service_name: "Badge Kiosk Unit", quantity: 3, notes: "Heavy-duty print mechanisms" }
          ],
          requirements: { kiosks: 3, kiosk_model: "Zebra ZD620" }
        }
      ]);
      setLoading(false);
    }, 600);
  }, [eventId]);

  const selectTemplate = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find(t => t.id === templateId);
    const initialFields: Record<string, any> = {};
    template?.fields.forEach(f => {
      initialFields[f.name] = f.default ?? "";
    });
    setDynamicFields(initialFields);
    setFormTitle(template ? `New ${template.name}` : "");
    setFormDescription(template ? `Custom provisioning for ${template.name.toLowerCase()}` : "");
    setItemsList([]);
    setWizardStep(2);
  };

  const handleAddFieldChange = (fieldName: string, value: any) => {
    setDynamicFields(prev => ({
      ...prev,
      [fieldName]: value
    }));
  };

  const addItemToWizard = () => {
    if (!newItemName.trim()) return;
    setItemsList(prev => [
      ...prev,
      { service_name: newItemName, quantity: newItemQty, notes: newItemNotes }
    ]);
    setNewItemName("");
    setNewItemQty(1);
    setNewItemNotes("");
  };

  const removeItemFromWizard = (idx: number) => {
    setItemsList(prev => prev.filter((_, i) => i !== idx));
  };

  const handleCreateRequest = () => {
    if (!formTitle.trim()) return;
    
    const newReq: ServiceRequest = {
      id: `r${Date.now()}`,
      request_number: `REQ-20260622-000${requests.length + 1}`,
      title: formTitle,
      description: formDescription,
      status: "SUBMITTED",
      priority: "HIGH",
      request_type: selectedTemplate,
      created_at: new Date().toISOString(),
      items: itemsList.length > 0 ? itemsList : [
        { service_name: `${selectedTemplate} Standard Package Setup`, quantity: 1, notes: "System generated" }
      ],
      requirements: dynamicFields
    };

    setRequests(prev => [newReq, ...prev]);
    setSelectedRequest(newReq);
    setIsWizardOpen(false);
    // reset states
    setWizardStep(1);
    setSelectedTemplate("");
    setFormTitle("");
    setFormDescription("");
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
      case "PLANNING":
        return "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
      case "SUBMITTED":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "DRAFT":
        return "bg-zinc-500/15 text-zinc-400 border-zinc-500/10";
      case "APPROVED":
        return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      default:
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    }
  };

  return (
    <div className="p-6 space-y-8 h-full overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] text-glow-indigo">
            My Service <span className="text-[var(--sec)]">Requests</span>
          </h1>
          <p className="text-muted font-bold text-xs uppercase tracking-[0.2em] opacity-80">
            Submit specs, track reviews, and configure dynamic technology catalog packages
          </p>
        </div>
        <Button 
          onClick={() => setIsWizardOpen(true)}
          className="h-11 px-6 bg-[var(--pri)] hover:bg-[var(--sec)] text-white font-black uppercase tracking-widest text-[11px] rounded-full hover-lift-3d"
        >
          <Plus className="mr-2 h-4 w-4" /> New Request
        </Button>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-8 overflow-hidden min-h-0">
        {/* Requests Queue Column */}
        <div className="lg:col-span-3 flex flex-col space-y-4 overflow-hidden h-full">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <Input 
                placeholder="Search active requests..."
                className="pl-11 h-11 bg-[var(--card)]/40 border-default rounded-xl font-medium"
              />
            </div>
            <Button variant="outline" className="h-11 px-4 border-default rounded-xl">
              <Filter className="h-4 w-4 text-muted" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
            {loading ? (
              <div className="flex h-48 items-center justify-center">
                <p className="text-muted text-xs font-black uppercase tracking-widest animate-pulse">Querying service requests...</p>
              </div>
            ) : requests.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-default rounded-3xl">
                <p className="text-xs text-muted font-bold">No technology requests found.</p>
              </div>
            ) : (
              requests.map((r, idx) => (
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
              ))
            )}
          </div>
        </div>

        {/* Requests Details / Spec Viewer Column */}
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
                  <h4 className="text-[10px] font-black text-muted uppercase tracking-widest">Catalog Items & Quantities</h4>
                  <div className="space-y-2">
                    {selectedRequest.items.map((item, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-[var(--card)]/40 border border-default flex justify-between items-center">
                        <div className="space-y-1">
                          <p className="text-[11px] font-black text-[var(--text)]">{item.service_name}</p>
                          {item.notes && <p className="text-[9px] text-muted font-medium">{item.notes}</p>}
                        </div>
                        <Badge variant="outline" className="border-default font-black text-[10px]">Qty: {item.quantity}</Badge>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Technical Specifications */}
                {Object.keys(selectedRequest.requirements).length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-muted uppercase tracking-widest">Technical Specifications</h4>
                    <div className="p-4 rounded-xl bg-[var(--card)]/40 border border-default space-y-2">
                      {Object.entries(selectedRequest.requirements).map(([key, val]) => (
                        <div key={key} className="flex justify-between border-b border-default/30 py-1 text-[11px]">
                          <span className="text-muted capitalize">{key.replace("_", " ")}</span>
                          <span className="font-bold text-[var(--text)]">{String(val)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {selectedRequest.status === "DRAFT" && (
                <div className="pt-6 border-t border-default/50 flex gap-3 mt-6">
                  <Button 
                    onClick={() => {
                      setRequests(prev => prev.map(r => r.id === selectedRequest.id ? { ...r, status: "SUBMITTED" } : r));
                      setSelectedRequest(prev => prev ? { ...prev, status: "SUBMITTED" } : null);
                    }}
                    className="flex-1 h-12 bg-[var(--pri)] hover:bg-[var(--sec)] font-black text-[10px] uppercase tracking-widest rounded-full"
                  >
                    Submit Request
                  </Button>
                </div>
              )}
            </motion.div>
          ) : (
            <div className="flex-1 rounded-[2.5rem] border border-dashed border-default flex flex-col items-center justify-center text-center p-8 bg-[var(--card)]/10">
              <ClipboardList className="h-12 w-12 text-muted mb-4 opacity-50" />
              <p className="text-sm font-black text-[var(--text)] tracking-tight uppercase tracking-wider">Select a Service Request</p>
              <p className="text-xs text-muted max-w-[200px] leading-relaxed mt-2">Choose any request from the queue to view its configuration, line items, and provisioning status.</p>
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Request Builder Wizard Modal */}
      <AnimatePresence>
        {isWizardOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-3d w-full max-w-2xl rounded-[2.5rem] border border-default/60 overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-default flex justify-between items-center bg-[var(--card)]/40">
                <div className="space-y-1">
                  <h3 className="text-lg font-black tracking-tight text-[var(--text)] uppercase">
                    Technology Services <span className="text-[var(--sec)]">Request Wizard</span>
                  </h3>
                  <p className="text-[10px] text-muted font-bold uppercase tracking-wider">
                    Step {wizardStep} of 3 — {wizardStep === 1 ? "Select Category" : wizardStep === 2 ? "Configure Form Fields" : "Add Catalog Items"}
                  </p>
                </div>
                <button 
                  onClick={() => { setIsWizardOpen(false); setWizardStep(1); }} 
                  className="h-8 w-8 rounded-full border border-default flex items-center justify-center hover:bg-[var(--card)] transition"
                >
                  <X className="h-4 w-4 text-muted" />
                </button>
              </div>

              {/* Wizard Content */}
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {wizardStep === 1 && (
                  <div className="space-y-4">
                    <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Select a dynamic service template:</p>
                    <div className="grid grid-cols-1 gap-4">
                      {templates.map(t => {
                        const IconComponent = t.icon;
                        return (
                          <div 
                            key={t.id}
                            onClick={() => selectTemplate(t.id)}
                            className="p-5 rounded-2xl border border-default bg-[var(--card)]/30 hover:bg-[var(--pri)]/5 hover:border-[var(--pri)]/40 cursor-pointer transition-all flex items-start gap-4"
                          >
                            <div className="h-10 w-10 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center text-[var(--pri)] shrink-0">
                              <IconComponent className="h-5 w-5" />
                            </div>
                            <div className="space-y-1">
                              <h4 className="text-xs font-black uppercase text-[var(--text)] tracking-wider">{t.name}</h4>
                              <p className="text-[11px] text-muted leading-relaxed font-bold">{t.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {wizardStep === 2 && (
                  <div className="space-y-5">
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-muted">Request Title</label>
                        <Input 
                          placeholder="e.g. Main Hall Audio Upgrade"
                          value={formTitle}
                          onChange={(e) => setFormTitle(e.target.value)}
                          className="h-11 bg-background/50 border-default font-semibold text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-muted">Description & Context</label>
                        <textarea 
                          rows={3}
                          placeholder="Provide details on where and when this is needed..."
                          value={formDescription}
                          onChange={(e) => setFormDescription(e.target.value)}
                          className="w-full p-3 bg-background/50 border border-default rounded-xl font-semibold text-xs text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--pri)]"
                        />
                      </div>
                    </div>

                    <div className="border-t border-default/50 pt-4 space-y-4">
                      <h4 className="text-[11px] font-black uppercase text-[var(--pri)] tracking-widest">Requirements Gathering Form</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {templates.find(t => t.id === selectedTemplate)?.fields.map(field => (
                          <div key={field.name} className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-wider text-muted">{field.label}</label>
                            {field.type === "select" ? (
                              <select 
                                value={dynamicFields[field.name] || ""}
                                onChange={(e) => handleAddFieldChange(field.name, e.target.value)}
                                className="w-full h-11 px-3 bg-background/50 border border-default rounded-xl font-semibold text-xs text-[var(--text)] focus:outline-none"
                              >
                                {field.options?.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : field.type === "checkbox" ? (
                              <div className="flex items-center gap-3 h-11 pl-3 bg-background/30 border border-default rounded-xl">
                                <input 
                                  type="checkbox" 
                                  checked={!!dynamicFields[field.name]}
                                  onChange={(e) => handleAddFieldChange(field.name, e.target.checked)}
                                  className="h-4 w-4 rounded border-default text-[var(--pri)] focus:ring-[var(--pri)]"
                                />
                                <span className="text-xs font-semibold text-[var(--text)]">Enable field requirement</span>
                              </div>
                            ) : (
                              <Input 
                                type={field.type}
                                value={dynamicFields[field.name] || ""}
                                onChange={(e) => handleAddFieldChange(field.name, field.type === "number" ? Number(e.target.value) : e.target.value)}
                                className="h-11 bg-background/50 border-default font-semibold text-xs"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {wizardStep === 3 && (
                  <div className="space-y-6">
                    <div className="p-4 rounded-2xl bg-[var(--card)]/30 border border-default space-y-4">
                      <h4 className="text-[10px] font-black text-muted uppercase tracking-widest">Select Catalog Equipment / Line Items</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Input 
                          placeholder="Item Name (e.g. 55-inch display)"
                          value={newItemName}
                          onChange={(e) => setNewItemName(e.target.value)}
                          className="h-11 bg-background/50 border-default font-semibold text-xs"
                        />
                        <Input 
                          type="number"
                          min={1}
                          placeholder="Quantity"
                          value={newItemQty}
                          onChange={(e) => setNewItemQty(Number(e.target.value))}
                          className="h-11 bg-background/50 border-default font-semibold text-xs"
                        />
                        <div className="flex gap-2">
                          <Input 
                            placeholder="Optional Notes"
                            value={newItemNotes}
                            onChange={(e) => setNewItemNotes(e.target.value)}
                            className="h-11 bg-background/50 border-default font-semibold text-xs flex-1"
                          />
                          <Button 
                            type="button" 
                            onClick={addItemToWizard} 
                            className="h-11 px-4 bg-[var(--pri)] font-black text-white rounded-xl"
                          >
                            Add
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black text-muted uppercase tracking-widest">Items Summary List</h4>
                      {itemsList.length === 0 ? (
                        <p className="text-xs text-muted font-bold text-center py-6 border border-dashed border-default rounded-xl">No custom items added. Standard catalog package will be assigned.</p>
                      ) : (
                        <div className="space-y-2">
                          {itemsList.map((item, idx) => (
                            <div key={idx} className="p-3 rounded-xl bg-[var(--card)]/40 border border-default flex justify-between items-center">
                              <div className="space-y-1">
                                <p className="text-xs font-black text-[var(--text)]">{item.service_name}</p>
                                {item.notes && <p className="text-[10px] text-muted font-medium">{item.notes}</p>}
                              </div>
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className="border-default font-black text-xs">Qty: {item.quantity}</Badge>
                                <button 
                                  onClick={() => removeItemFromWizard(idx)} 
                                  className="h-6 w-6 rounded-full border border-default flex items-center justify-center hover:bg-rose-500/10 text-rose-500 transition"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-default bg-[var(--card)]/20 flex justify-between items-center">
                {wizardStep > 1 ? (
                  <Button 
                    variant="outline" 
                    onClick={() => setWizardStep(prev => prev - 1)}
                    className="h-11 px-6 border-default font-black text-[10px] uppercase tracking-widest rounded-full"
                  >
                    Back
                  </Button>
                ) : <div />}

                {wizardStep < 3 ? (
                  <Button 
                    onClick={() => setWizardStep(prev => prev + 1)}
                    disabled={wizardStep === 2 && !formTitle.trim()}
                    className="h-11 px-6 bg-[var(--pri)] hover:bg-[var(--sec)] text-white font-black text-[10px] uppercase tracking-widest rounded-full"
                  >
                    Continue <ChevronRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button 
                    onClick={handleCreateRequest}
                    disabled={!formTitle.trim()}
                    className="h-11 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest rounded-full"
                  >
                    Submit Specifications
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
