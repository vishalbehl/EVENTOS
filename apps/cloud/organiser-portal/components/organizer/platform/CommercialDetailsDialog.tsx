"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Layers3,
  MapPin,
  CreditCard,
  Check,
  X,
  Sparkles,
  Clock,
  ShieldCheck,
  Server,
  Users,
  Calendar,
  Layers,
  Coins,
  Award,
  FileBadge,
  FileText,
  Ticket,
  Cloud,
  DoorOpen,
  UserCheck,
  User,
  CalendarDays,
  Info,
  Package,
  Tag,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Smartphone,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Format currency helper
function formatINR(val: any) {
  const num = Number(val);
  if (isNaN(num)) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(num);
}

// Convert bytes/MB to human readable
function formatStorage(mb: number) {
  if (!mb) return "0 GB";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1).replace(".0", "")} GB`;
  return `${mb} MB`;
}

export type DetailType = "plan" | "addon" | "template";

interface CommercialDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: DetailType | null;
  data: any | null;
}

export function CommercialDetailsDialog({
  open,
  onOpenChange,
  type,
  data,
}: CommercialDetailsDialogProps) {
  if (!data || !type) return null;

  const imageUrl = typeof data.image_url === "string" && data.image_url.trim() ? data.image_url.trim() : data.imageUrl;
  const isVenue = type === "addon" && (data.addon_type || data.type) === "VENUE";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "border-white/10 bg-[#0a0a0f] text-white rounded-3xl p-0 overflow-hidden select-none max-h-[95vh] overflow-y-auto custom-scrollbar border-r-4 border-r-[#e0ff00]",
        type === "plan" ? "max-w-4xl" : "max-w-2xl"
      )}>

        {/* Cover Image Section - occupying at least 40% height */}
        <div className="relative h-72 md:h-96 w-full bg-gradient-to-br from-zinc-950 to-neutral-900 border-b border-white/5 overflow-hidden">
          {imageUrl ? (
            <img src={imageUrl} alt={data.name} className="h-full w-full object-contain mx-auto" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              {type === "plan" ? (
                <CreditCard className="h-20 w-20 text-[#e0ff00]/10 animate-pulse-subtle" />
              ) : isVenue ? (
                <MapPin className="h-20 w-20 text-[#e0ff00]/10 animate-pulse-subtle" />
              ) : (
                <Layers3 className="h-20 w-20 text-[#e0ff00]/10 animate-pulse-subtle" />
              )}
            </div>
          )}

          {/* Dark gradient fade-out at the bottom */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-transparent" />

          {/* Overlay containing Name and Price */}
          <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between gap-4">
            <div className="space-y-1 text-left">
              <span className="inline-block rounded-full bg-[#e0ff00]/10 border border-[#e0ff00]/25 px-2.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#e0ff00] mb-1">
                {type === "plan" ? "Subscription Tier" : type === "addon" ? (isVenue ? "Venue Service" : "Plan Extension") : "Ops Template"}
              </span>
              <DialogTitle className="text-xl md:text-2xl font-black tracking-tight text-white leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                {data.name}
              </DialogTitle>
            </div>
            <div className="text-right shrink-0 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              <span className="text-[8px] uppercase tracking-widest text-white/40 block font-bold">Commercial Rate</span>
              <span className="text-xl md:text-2xl font-mono font-black text-[#e0ff00] mt-0.5 block">
                {type === "plan"
                  ? (data.priceLabel || (data.price_per_event ? formatINR(data.price_per_event) : "Custom Pricing"))
                  : (data.priceLabel || (data.final_price ? formatINR(data.final_price) : (data.price_inr ? formatINR(data.price_inr) : "Included")))}
                {type !== "plan" && (data.price_unit || data.priceUnit) ? (
                  <span className="text-xs font-normal text-white/60 lowercase"> / {data.price_unit || data.priceUnit}</span>
                ) : null}
              </span>
            </div>
          </div>
        </div>

        {/* Content Body Wrapper with padding */}
        <div className="p-8 pt-4 space-y-6">

          {/* Mockup Stats Row */}
          <div className={cn(
            "grid gap-6 py-4 border border-white/5 bg-[#0f0f15]/50 rounded-2xl px-6 mt-6",
            isVenue ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2"
          )}>
            <div className="flex items-center gap-3 text-left">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/5 bg-[#0a0a0f] text-white/60">
                <Tag className="h-4.5 w-4.5 text-[#e0ff00]" />
              </div>
              <div>
                <span className="text-[8px] font-bold uppercase tracking-widest text-white/40 block">Pricing model</span>
                <span className="text-xs font-black text-white mt-0.5 block uppercase">
                  {type === "plan"
                    ? (data.billing_model || "PER_EVENT").replace("_", " ")
                    : (data.billing_unit || data.billingUnit || "PER_EVENT").replace("_", " ")}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-left border-l border-white/5 pl-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/5 bg-[#0a0a0f] text-white/60">
                <Calendar className="h-4.5 w-4.5 text-[#e0ff00]" />
              </div>
              <div>
                <span className="text-[8px] font-bold uppercase tracking-widest text-white/40 block">Availability</span>
                <span className="text-xs font-black text-white mt-0.5 block">
                  {type === "plan"
                    ? "Standard catalog"
                    : type === "addon"
                      ? (isVenue ? "Venue specific" : "Plan dependent")
                      : (data.categoryLabel || "Operations Template")}
                </span>
              </div>
            </div>
            {isVenue && (
              <>
                <div className="flex items-center gap-3 text-left border-l border-white/5 pl-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/5 bg-[#0a0a0f] text-white/60">
                    <Server className="h-4.5 w-4.5 text-[#e0ff00]" />
                  </div>
                  <div>
                    <span className="text-[8px] font-bold uppercase tracking-widest text-white/40 block">Hardware count</span>
                    <span className="text-xs font-black text-white mt-0.5 block">
                      {Array.isArray(data.hardware_spec)
                        ? data.hardware_spec.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)
                        : 0} Items
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-left border-l border-white/5 pl-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/5 bg-[#0a0a0f] text-white/60">
                    <Users className="h-4.5 w-4.5 text-[#e0ff00]" />
                  </div>
                  <div>
                    <span className="text-[8px] font-bold uppercase tracking-widest text-white/40 block">Crew count</span>
                    <span className="text-xs font-black text-white mt-0.5 block">
                      {Array.isArray(data.staff_spec)
                        ? data.staff_spec.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)
                        : 0} Staff
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* DYNAMIC DETAILS BY TYPE */}

          {/* Type 1: Plan Details */}
          {type === "plan" && (() => {
            const entitlementsList = [
              {
                icon: Users,
                title: "Team Members",
                prefix: "Collaborate with up to",
                value: data.max_users ? data.max_users.toLocaleString() : "Unlimited",
                suffix: "team members",
                show: true,
              },
              {
                icon: UserCheck,
                title: "Registrations",
                prefix: "Accept and manage up to",
                value: data.max_registrations ? data.max_registrations.toLocaleString() : "Unlimited",
                suffix: "event registrations",
                show: true,
              },
              {
                icon: User,
                title: "Speakers",
                prefix: "Add and showcase up to",
                value: data.max_speakers ? data.max_speakers.toLocaleString() : "Unlimited",
                suffix: "speakers",
                show: true,
              },
              {
                icon: CalendarDays,
                title: "Sessions",
                prefix: "Create and organize up to",
                value: data.max_sessions ? data.max_sessions.toLocaleString() : "Unlimited",
                suffix: "event sessions",
                show: true,
              },
              {
                icon: DoorOpen,
                title: "Rooms",
                prefix: "Schedule sessions across",
                value: data.max_rooms ? data.max_rooms.toLocaleString() : "Unlimited",
                suffix: "rooms",
                show: true,
              },
              {
                icon: Ticket,
                title: "Ticket Categories",
                prefix: "Offer up to",
                value: data.max_ticket_categories ? data.max_ticket_categories.toLocaleString() : "Unlimited",
                suffix: "ticket categories",
                show: !!data.max_ticket_categories,
              },
              {
                icon: Cloud,
                title: "Storage",
                prefix: "Get",
                value: formatStorage(data.storage_quota_mb),
                suffix: "of secure storage",
                show: !!data.storage_quota_mb,
              },
              {
                icon: FileText,
                title: "Other Includes",
                prefix: "Includes standard",
                value: null,
                suffix: "features & updates",
                show: true,
              },
            ].filter((item) => item.show);

            return (
              <div className="border-t border-white/5 pt-6 mt-6">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-[#e0ff00] flex items-center gap-1.5 mb-5">
                  <ShieldCheck className="w-4 h-4 text-[#e0ff00]" /> Entitlements & Capacity Limits
                </h4>

                <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                  {entitlementsList.map((item, idx) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={idx}
                        className="flex flex-col items-center justify-center text-center p-5 rounded-3xl border border-white/5 bg-[#0f0f15]/80 hover:bg-white/[0.03] transition-all duration-200"
                      >
                        <Icon className="w-6 h-6 text-[#e0ff00] shrink-0" />
                        <div className="text-[11px] font-black text-white mt-3">
                          {item.title}
                        </div>
                        <div className="text-[9px] text-white/35 mt-2.5">
                          {item.prefix}
                        </div>
                        {item.value !== null && (
                          <div className="text-xl font-mono font-black text-[#e0ff00] mt-1 leading-none">
                            {item.value}
                          </div>
                        )}
                        <div className="text-[9px] text-white/35 mt-1 leading-tight">
                          {item.suffix}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bottom Info Banner */}
                <div className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.01] p-3.5 text-[10px] text-white/40 mt-6">
                  <Info className="w-4 h-4 text-white/30 shrink-0" />
                  <span>Limits are per event. Need more? Upgrade to Enterprise or add-on packs.</span>
                </div>
              </div>
            );
          })()}

          {/* Type 2: Addon Details */}
          {type === "addon" && (
            <div className="space-y-6 border-t border-white/5 pt-6 mt-6">

              {/* Product Overview */}
              <div className="border border-white/5 bg-[#0f0f15]/30 p-6 rounded-3xl text-left">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-[#e0ff00] flex items-center gap-1.5 mb-3">
                  <FileText className="w-3.5 h-3.5 text-[#e0ff00]" /> Product Overview
                </h4>
                <p className="text-xs text-white/70 leading-relaxed font-medium">
                  {data.description || "Specifications and commercial parameters."}
                </p>
              </div>

              {/* Split Inclusions & Exclusions */}
              <div className="grid gap-6 md:grid-cols-[1.6fr_1.4fr]">
                {/* Inclusions */}
                <div className="border border-white/5 bg-[#0f0f15]/30 p-6 rounded-3xl text-left">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-[#e0ff00] flex items-center gap-1.5 mb-4">
                    <CheckCircle2 className="w-4 h-4 text-[#e0ff00]" /> What's Included
                  </h4>
                  {Array.isArray(data.inclusions) && data.inclusions.length > 0 ? (
                    <div className="grid gap-x-4 gap-y-3.5 grid-cols-1 sm:grid-cols-2">
                      {data.inclusions.map((item: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-2 text-xs text-white/80 font-medium leading-relaxed">
                          <CheckCircle2 className="w-4 h-4 text-[#e0ff00] shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-white/35 font-semibold">Standard package scope.</p>
                  )}
                </div>

                {/* Exclusions */}
                <div className="border border-white/5 bg-[#0f0f15]/30 p-6 rounded-3xl text-left">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-red-400/90 flex items-center gap-1.5 mb-4">
                    <XCircle className="w-4 h-4 text-red-400" /> Out of Scope
                  </h4>
                  {Array.isArray(data.exclusions) && data.exclusions.length > 0 ? (
                    <div className="space-y-3.5">
                      {data.exclusions.map((item: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-2 text-xs text-white/80 font-medium leading-relaxed">
                          <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-white/35 font-semibold">No general exclusions specified.</p>
                  )}
                </div>
              </div>

              {Number(data.consumables_cost || data.consumablesCost) > 0 && (
                <div className="rounded-2xl border border-white/5 bg-white/[0.015] p-4 flex items-center justify-between">
                  <div>
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-[#e0ff00]">Consumables Surcharge</h5>
                    <p className="text-[9px] text-white/35 mt-0.5">Applies for raw materials and provisioning fees.</p>
                  </div>
                  <span className="font-mono text-xs font-black text-white">
                    +{formatINR(data.consumables_cost || data.consumablesCost)}
                  </span>
                </div>
              )}

              {/* Bottom Info Banner */}
              <div className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.01] p-3.5 text-[10px] text-white/40 mt-6">
                <Info className="w-4 h-4 text-white/35 shrink-0" />
                <span>This is an add-on service. Pricing is per event and subject to plan compatibility.</span>
              </div>

            </div>
          )}

          {/* Type 3: Operations Template Details */}
          {type === "template" && (() => {
            const staffCount = Array.isArray(data.staff_allocation)
              ? data.staff_allocation.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0)
              : 0;

            const totalCost = Number(data.total_estimated_cost ?? data.estimated_cost ?? data.totalCost ?? 0);
            const hardwareCost = totalCost * 0.6;
            const staffCost = totalCost * 0.25;
            const logisticsCost = totalCost * 0.1;
            const contingencyCost = totalCost * 0.05;

            return (
              <div className="space-y-5 border-t border-white/5 pt-6 mt-6">
                {/* Timeline setup times */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.01] p-3">
                    <Clock className="w-4 h-4 text-[#e0ff00] shrink-0" />
                    <div>
                      <span className="text-[9px] font-bold text-white/35 block uppercase tracking-wider">Setup Duration</span>
                      <span className="text-xs font-black text-white mt-0.5 block">{data.setup_time ?? data.setupTime ?? 0} Hours</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.01] p-3">
                    <Clock className="w-4 h-4 text-[#e0ff00] shrink-0" />
                    <div>
                      <span className="text-[9px] font-bold text-white/35 block uppercase tracking-wider">Teardown Duration</span>
                      <span className="text-xs font-black text-white mt-0.5 block">{data.teardown_time ?? data.teardownTime ?? 0} Hours</span>
                    </div>
                  </div>
                </div>

                {/* Capacity info */}
                <div className="grid grid-cols-4 gap-3 rounded-xl border border-white/5 bg-white/[0.01] p-3.5">
                  <div>
                    <span className="text-[8px] font-bold text-white/35 uppercase tracking-wider block">Capacity</span>
                    <span className="text-[11px] font-black text-white mt-0.5 block">{data.default_capacity ?? data.defaultCapacity ?? data.min_speakers ?? data.min_attendees ?? "N/A"}</span>
                  </div>
                  <div className="border-l border-white/5 pl-3">
                    <span className="text-[8px] font-bold text-white/35 uppercase tracking-wider block">Rooms</span>
                    <span className="text-[11px] font-black text-white mt-0.5 block">{data.rooms ?? data.roomCount ?? 1}</span>
                  </div>
                  <div className="border-l border-white/5 pl-3">
                    <span className="text-[8px] font-bold text-white/35 uppercase tracking-wider block">Podiums</span>
                    <span className="text-[11px] font-black text-white mt-0.5 block">{data.podiums ?? 0}</span>
                  </div>
                  <div className="border-l border-white/5 pl-3">
                    <span className="text-[8px] font-bold text-white/35 uppercase tracking-wider block">Allocated Crew</span>
                    <span className="text-[11px] font-black text-white mt-0.5 block">{staffCount || 3}</span>
                  </div>
                </div>

                {/* Cost breakdown summary from pricing engine */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-[#e0ff00] flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-[#e0ff00]" /> Estimated Cost & Operational Overhead
                  </h4>
                  <div className="divide-y divide-white/5 rounded-2xl border border-white/5 bg-[#0f0f15]/80 px-4 py-1">
                    {[
                      { label: "Base Hardware Lease", val: hardwareCost },
                      { label: "Staff Operational Rate", val: staffCost },
                      { label: "Logistics & Transport", val: logisticsCost },
                      { label: "Contingency buffer", val: contingencyCost },
                    ].map((row, idx) => (
                      <div key={idx} className="flex justify-between items-center py-2.5 text-xs">
                        <span className="text-white/50 font-medium">{row.label}</span>
                        <span className="font-mono text-xs font-bold text-white/80">{formatINR(row.val)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center py-3 text-sm font-black border-t border-white/10">
                      <span>Estimated Total Cost</span>
                      <span className="font-mono text-sm text-[#e0ff00]">
                        {formatINR(totalCost)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* FOOTER */}
          <div className="flex justify-end pt-4 mt-6">
            <button
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-2 px-6 h-11 text-[10px] font-black uppercase tracking-widest rounded-xl bg-white/10 hover:bg-white/15 text-white transition-all active:scale-95 border border-white/5"
            >
              <span>Close Details</span>
              <ChevronRight className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
