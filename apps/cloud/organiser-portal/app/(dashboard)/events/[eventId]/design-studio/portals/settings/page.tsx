"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  SlidersHorizontal,
  Save,
  RefreshCw,
  Layout,
  Users,
  Mic,
  FileText,
  Calendar,
  CreditCard,
  Award,
  Building2,
  HelpCircle,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Clock,
  Mail,
  Phone,
  Shield,
  ArrowRight,
  ExternalLink,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { OrganiserPage, Panel } from "@/components/organizer/workspace/OrganiserPrimitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { designStudioService, PortalSettingsData } from "@/services/design-studio-service";
import { useEvent } from "@/hooks/useEvents";

export default function PortalSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = (params?.eventId as string) || "";
  const { data: event } = useEvent(eventId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"capabilities" | "access" | "support" | "faqs">("capabilities");

  const [formData, setFormData] = useState<PortalSettingsData>({
    enabled: true,
    registration_allowed: true,
    participants_list_allowed: true,
    window_required: true,
    edit_cutoff_days: 0,
    edit_cutoff_date: null,
    support_email: "",
    support_phone: "",
    additional_contacts: [],
    terms_and_conditions: "",
    faqs: [],
    include_default_faqs: true,
    capabilities: {
      show_registration: true,
      show_speakers: true,
      show_abstracts: true,
      show_agenda: true,
      show_badges: true,
      show_certificates: true,
      show_exhibitors: true,
      show_support: true,
      show_resources: true,
    },
    theme_preset: "dark-luxury",
    primary_color: "#6366F1",
    secondary_color: "#8B5CF6",
    tagline: "",
    hero_description: "",
  });

  const loadSettings = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const data = await designStudioService.portal.get(eventId);
      setFormData(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load portal configuration");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    if (!eventId) return;
    setSaving(true);
    try {
      const updated = await designStudioService.portal.update(eventId, formData);
      setFormData(updated);
      toast.success("Portal capabilities and access settings saved successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save portal settings");
    } finally {
      setSaving(false);
    }
  };

  const toggleCapability = (key: keyof typeof formData.capabilities) => {
    setFormData((prev) => ({
      ...prev,
      capabilities: {
        ...prev.capabilities,
        [key]: !prev.capabilities[key],
      },
    }));
  };

  const addContact = () => {
    setFormData((prev) => ({
      ...prev,
      additional_contacts: [
        ...prev.additional_contacts,
        { id: `contact-${Date.now()}`, type: "email", value: "", label: "Support Desk" },
      ],
    }));
  };

  const removeContact = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      additional_contacts: prev.additional_contacts.filter((c) => c.id !== id),
    }));
  };

  const addFaq = () => {
    setFormData((prev) => ({
      ...prev,
      faqs: [
        ...prev.faqs,
        { q: "New Question Title", a: "Provide clear helpful instructions for attendees here." },
      ],
    }));
  };

  const removeFaq = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      faqs: prev.faqs.filter((_, i) => i !== index),
    }));
  };

  const capabilitiesList = [
    {
      key: "show_registration" as const,
      label: "Registration & Ticket Sales",
      desc: "Allow delegates to purchase passes, select tiers, and complete questionnaire forms.",
      icon: Users,
      color: "from-blue-500/20 to-indigo-500/20 text-blue-400",
    },
    {
      key: "show_speakers" as const,
      label: "Speaker & Faculty Center",
      desc: "Dedicated workspace for invited faculty to manage talks, upload slide decks, and submit bios.",
      icon: Mic,
      color: "from-purple-500/20 to-pink-500/20 text-purple-400",
    },
    {
      key: "show_abstracts" as const,
      label: "Abstract Submission & Peer Review",
      desc: "Scientific call for papers intake, co-author management, and reviewer decision tracking.",
      icon: FileText,
      color: "from-amber-500/20 to-orange-500/20 text-amber-400",
    },
    {
      key: "show_agenda" as const,
      label: "Interactive Program & Schedule",
      desc: "Public multi-track schedule grid with search, speaker profiles, and bookmarking.",
      icon: Calendar,
      color: "from-emerald-500/20 to-teal-500/20 text-emerald-400",
    },
    {
      key: "show_badges" as const,
      label: "Digital Entry Passes & Badges",
      desc: "Display attendee QR code entry passes for on-site kiosk check-in and self-printing.",
      icon: CreditCard,
      color: "from-cyan-500/20 to-blue-500/20 text-cyan-400",
    },
    {
      key: "show_certificates" as const,
      label: "Certificates of Attendance",
      desc: "Enable participants to download verified digital certificates post-event.",
      icon: Award,
      color: "from-yellow-500/20 to-amber-500/20 text-yellow-400",
    },
    {
      key: "show_exhibitors" as const,
      label: "Sponsor & Exhibitor Showcase",
      desc: "Directory of corporate partners, booth locations, and downloadable sponsor collateral.",
      icon: Building2,
      color: "from-rose-500/20 to-pink-500/20 text-rose-400",
    },
    {
      key: "show_resources" as const,
      label: "Program Guide & Materials Downloads",
      desc: "Direct access to official conference handbook PDF, guidelines, and slide decks.",
      icon: FolderOpen,
      color: "from-violet-500/20 to-indigo-500/20 text-violet-400",
    },
    {
      key: "show_support" as const,
      label: "Helpdesk & Multi-Channel Support",
      desc: "Display organizer emergency contacts, WhatsApp desk, and ticketing help modal.",
      icon: HelpCircle,
      color: "from-emerald-500/20 to-green-500/20 text-emerald-400",
    },
  ];

  return (
    <OrganiserPage
      title="Portal Capabilities & Settings"
      description="Control exactly what features, modules, and workspaces are displayed on the public Participant Portal."
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/events/${eventId}/design-studio/portals/designer`)}
            className="h-8 text-xs font-semibold gap-1.5 border-[var(--border-default)] cursor-pointer"
          >
            <Layout className="size-3.5 text-[var(--pri,#4f46e5)]" />
            Open Portal Designer
          </Button>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || loading}
            className="h-8 text-xs font-semibold gap-1.5 bg-[var(--pri,#4f46e5)] text-white hover:bg-[var(--pri-hover,#4338ca)] cursor-pointer"
          >
            {saving ? <RefreshCw className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save Changes
          </Button>
        </div>
      }
    >
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-[var(--border-default,#27272a)] pb-3 mb-6">
        <button
          onClick={() => setActiveTab("capabilities")}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === "capabilities"
              ? "bg-[var(--pri,#4f46e5)] text-white shadow-sm"
              : "text-[var(--text-secondary,#a1a1aa)] hover:bg-[var(--surface-active,#27272a)]"
          }`}
        >
          Portal Capabilities Matrix
        </button>
        <button
          onClick={() => setActiveTab("access")}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === "access"
              ? "bg-[var(--pri,#4f46e5)] text-white shadow-sm"
              : "text-[var(--text-secondary,#a1a1aa)] hover:bg-[var(--surface-active,#27272a)]"
          }`}
        >
          Access & Cutoff Policies
        </button>
        <button
          onClick={() => setActiveTab("support")}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === "support"
              ? "bg-[var(--pri,#4f46e5)] text-white shadow-sm"
              : "text-[var(--text-secondary,#a1a1aa)] hover:bg-[var(--surface-active,#27272a)]"
          }`}
        >
          Support & Contacts
        </button>
        <button
          onClick={() => setActiveTab("faqs")}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === "faqs"
              ? "bg-[var(--pri,#4f46e5)] text-white shadow-sm"
              : "text-[var(--text-secondary,#a1a1aa)] hover:bg-[var(--surface-active,#27272a)]"
          }`}
        >
          Terms & FAQs
        </button>
      </div>

      {loading ? (
        <div className="p-16 flex flex-col items-center justify-center space-y-3 text-center">
          <RefreshCw className="size-8 text-[var(--pri,#4f46e5)] animate-spin" />
          <p className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider">
            Loading Portal Settings...
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* TAB 1: CAPABILITIES MATRIX */}
          {activeTab === "capabilities" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[var(--surface-panel,#18181b)] border border-[var(--border-default,#27272a)] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary,#fff)] flex items-center gap-2">
                    <Globe className="size-4 text-[var(--pri,#4f46e5)]" />
                    Master Participant Portal Status
                  </h3>
                  <p className="text-xs text-[var(--text-secondary,#a1a1aa)] mt-0.5">
                    When active, the attendee and speaker portal is live and accessible to participants.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, enabled: !prev.enabled }))}
                  className="cursor-pointer"
                >
                  {formData.enabled ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold">
                      <CheckCircle2 className="size-3.5" /> Portal Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-bold">
                      <AlertCircle className="size-3.5" /> Portal Offline
                    </span>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {capabilitiesList.map((item) => {
                  const Icon = item.icon;
                  const isEnabled = formData.capabilities[item.key];
                  return (
                    <div
                      key={item.key}
                      onClick={() => toggleCapability(item.key)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                        isEnabled
                          ? "bg-[var(--surface-panel,#18181b)] border-[var(--pri,#4f46e5)]/40 shadow-sm"
                          : "bg-[var(--surface-panel,#18181b)]/40 border-[var(--border-default,#27272a)] opacity-60 hover:opacity-100"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className={`p-2.5 rounded-lg bg-gradient-to-br ${item.color}`}>
                            <Icon className="size-4" />
                          </div>
                          {isEnabled ? (
                            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                              Enabled
                            </span>
                          ) : (
                            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary,#71717a)] bg-zinc-800 px-2 py-0.5 rounded-full">
                              Disabled
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-bold text-[var(--text-primary,#fff)]">{item.label}</h4>
                        <p className="text-xs text-[var(--text-secondary,#a1a1aa)] mt-1 leading-relaxed">
                          {item.desc}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-[var(--border-default,#27272a)] flex items-center justify-between text-[11px] font-semibold text-[var(--text-secondary,#a1a1aa)]">
                        <span>Click to {isEnabled ? "disable" : "enable"}</span>
                        {isEnabled ? (
                          <ToggleRight className="size-5 text-[var(--pri,#4f46e5)]" />
                        ) : (
                          <ToggleLeft className="size-5 text-[var(--text-tertiary,#71717a)]" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: ACCESS & CUTOFF POLICIES */}
          {activeTab === "access" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Panel title="Profile & Registration Deadlines" className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                    Profile Edit Cutoff Date
                  </label>
                  <Input
                    type="date"
                    value={formData.edit_cutoff_date || ""}
                    onChange={(e) => setFormData((prev) => ({ ...prev, edit_cutoff_date: e.target.value }))}
                    className="bg-[var(--surface-input,#09090b)] border-[var(--border-default,#27272a)] text-xs text-white"
                  />
                  <p className="text-[11px] text-[var(--text-tertiary,#71717a)] mt-1">
                    Attendees cannot alter badge names, designations, or profile details after this date.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                    Cutoff Days Prior to Event
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.edit_cutoff_days}
                    onChange={(e) => setFormData((prev) => ({ ...prev, edit_cutoff_days: Number(e.target.value) || 0 }))}
                    className="bg-[var(--surface-input,#09090b)] border-[var(--border-default,#27272a)] text-xs text-white"
                  />
                  <p className="text-[11px] text-[var(--text-tertiary,#71717a)] mt-1">
                    Number of days before the event start date to automatically freeze attendee profiles.
                  </p>
                </div>
              </Panel>

              <Panel title="Privacy & Security Controls" className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-ground,#09090b)] border border-[var(--border-default,#27272a)]">
                  <div>
                    <span className="text-xs font-bold text-white block">Public Delegate Directory</span>
                    <span className="text-[11px] text-[var(--text-secondary,#a1a1aa)]">
                      Allow logged-in attendees to view the roster of attending peers.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, participants_list_allowed: !prev.participants_list_allowed }))}
                    className="cursor-pointer"
                  >
                    {formData.participants_list_allowed ? (
                      <ToggleRight className="size-6 text-emerald-400" />
                    ) : (
                      <ToggleLeft className="size-6 text-zinc-600" />
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-ground,#09090b)] border border-[var(--border-default,#27272a)]">
                  <div>
                    <span className="text-xs font-bold text-white block">Registration Checkout Window</span>
                    <span className="text-[11px] text-[var(--text-secondary,#a1a1aa)]">
                      Enforce strict open/close dates for public ticket purchasing.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, window_required: !prev.window_required }))}
                    className="cursor-pointer"
                  >
                    {formData.window_required ? (
                      <ToggleRight className="size-6 text-[var(--pri,#4f46e5)]" />
                    ) : (
                      <ToggleLeft className="size-6 text-zinc-600" />
                    )}
                  </button>
                </div>
              </Panel>
            </div>
          )}

          {/* TAB 3: SUPPORT & CONTACTS */}
          {activeTab === "support" && (
            <div className="space-y-6">
              <Panel title="Primary Support Desk" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                      Support Email Address
                    </label>
                    <Input
                      type="email"
                      value={formData.support_email || ""}
                      onChange={(e) => setFormData((prev) => ({ ...prev, support_email: e.target.value }))}
                      placeholder="support@eventconference.org"
                      className="bg-[var(--surface-input,#09090b)] border-[var(--border-default,#27272a)] text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[var(--text-secondary,#a1a1aa)] uppercase tracking-wider block mb-1.5">
                      Support Phone / WhatsApp
                    </label>
                    <Input
                      type="text"
                      value={formData.support_phone || ""}
                      onChange={(e) => setFormData((prev) => ({ ...prev, support_phone: e.target.value }))}
                      placeholder="+1 (555) 019-2834"
                      className="bg-[var(--surface-input,#09090b)] border-[var(--border-default,#27272a)] text-xs text-white"
                    />
                  </div>
                </div>
              </Panel>

              <Panel
                title="Additional Multi-Channel Contacts"
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={addContact}
                    className="h-7 text-xs font-semibold gap-1 border-[var(--border-default)] cursor-pointer"
                  >
                    <Plus className="size-3" /> Add Channel
                  </Button>
                }
                className="space-y-3"
              >
                {formData.additional_contacts.length === 0 ? (
                  <p className="text-xs text-[var(--text-tertiary,#71717a)] italic text-center py-4">
                    No additional support channels configured. Click &quot;Add Channel&quot; to add WhatsApp desks, travel coordinators, or emergency hotlines.
                  </p>
                ) : (
                  formData.additional_contacts.map((contact, idx) => (
                    <div
                      key={contact.id || idx}
                      className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface-ground,#09090b)] border border-[var(--border-default,#27272a)]"
                    >
                      <Input
                        value={contact.label}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData((prev) => ({
                            ...prev,
                            additional_contacts: prev.additional_contacts.map((c, i) =>
                              i === idx ? { ...c, label: val } : c
                            ),
                          }));
                        }}
                        placeholder="e.g. Venue Emergency Desk"
                        className="bg-black/30 border-[var(--border-default,#27272a)] text-xs text-white max-w-[200px]"
                      />
                      <select
                        value={contact.type}
                        onChange={(e) => {
                          const val = e.target.value as "email" | "phone";
                          setFormData((prev) => ({
                            ...prev,
                            additional_contacts: prev.additional_contacts.map((c, i) =>
                              i === idx ? { ...c, type: val } : c
                            ),
                          }));
                        }}
                        className="bg-black/30 border border-[var(--border-default,#27272a)] text-xs text-white px-3 py-2 rounded-md"
                      >
                        <option value="email">Email</option>
                        <option value="phone">Phone / WhatsApp</option>
                      </select>
                      <Input
                        value={contact.value}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData((prev) => ({
                            ...prev,
                            additional_contacts: prev.additional_contacts.map((c, i) =>
                              i === idx ? { ...c, value: val } : c
                            ),
                          }));
                        }}
                        placeholder="Contact value..."
                        className="bg-black/30 border-[var(--border-default,#27272a)] text-xs text-white flex-1"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeContact(contact.id)}
                        className="size-8 text-rose-400 hover:bg-rose-500/10 cursor-pointer shrink-0"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))
                )}
              </Panel>
            </div>
          )}

          {/* TAB 4: TERMS & FAQS */}
          {activeTab === "faqs" && (
            <div className="space-y-6">
              <Panel title="Event Portal Terms & Conditions" className="space-y-3">
                <Textarea
                  rows={8}
                  value={formData.terms_and_conditions}
                  onChange={(e) => setFormData((prev) => ({ ...prev, terms_and_conditions: e.target.value }))}
                  placeholder="# Enter Markdown Terms & Conditions..."
                  className="bg-[var(--surface-input,#09090b)] border-[var(--border-default,#27272a)] text-xs text-white font-mono"
                />
              </Panel>

              <Panel
                title="Participant Portal FAQs"
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={addFaq}
                    className="h-7 text-xs font-semibold gap-1 border-[var(--border-default)] cursor-pointer"
                  >
                    <Plus className="size-3" /> Add FAQ
                  </Button>
                }
                className="space-y-3"
              >
                {formData.faqs.length === 0 ? (
                  <p className="text-xs text-[var(--text-tertiary,#71717a)] italic text-center py-4">
                    No custom FAQs configured. Click &quot;Add FAQ&quot; to answer common attendee queries.
                  </p>
                ) : (
                  formData.faqs.map((faq, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-lg bg-[var(--surface-ground,#09090b)] border border-[var(--border-default,#27272a)] space-y-2 relative"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Input
                          value={faq.q}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormData((prev) => ({
                              ...prev,
                              faqs: prev.faqs.map((f, i) => (i === idx ? { ...f, q: val } : f)),
                            }));
                          }}
                          placeholder="Question title..."
                          className="bg-black/30 border-[var(--border-default,#27272a)] text-xs font-bold text-white flex-1"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeFaq(idx)}
                          className="size-7 text-rose-400 hover:bg-rose-500/10 cursor-pointer shrink-0"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      <Textarea
                        rows={2}
                        value={faq.a}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData((prev) => ({
                            ...prev,
                            faqs: prev.faqs.map((f, i) => (i === idx ? { ...f, a: val } : f)),
                          }));
                        }}
                        placeholder="Answer details..."
                        className="bg-black/30 border-[var(--border-default,#27272a)] text-xs text-[var(--text-secondary,#a1a1aa)]"
                      />
                    </div>
                  ))
                )}
              </Panel>
            </div>
          )}
        </div>
      )}
    </OrganiserPage>
  );
}
