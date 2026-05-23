"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe, Sliders, Shield, Trash2, Save, Loader2, Building2, MapPin, Calendar, Users, Info, ToggleLeft, FileArchive, Zap, AlertCircle, Clock
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useEvent, useUpdateEvent } from "@/hooks/useEvents";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/use-auth-store";
import { Skeleton } from "@/components/ui/skeleton";

type SettingsTab = "profile" | "policies" | "team" | "danger";
type ProgramStatus = "draft" | "final" | "updated";

const statusToProgram = (status?: string): ProgramStatus => {
  if (status === "active") return "final";
  if (status === "completed" || status === "archived") return "updated";
  return "draft";
};

const programToStatus = (status: ProgramStatus) => {
  if (status === "final") return "active";
  if (status === "updated") return "completed";
  return "draft";
};

const toDateInput = (value?: string | null) => (value ? value.slice(0, 10) : "");
const toDateTimeInput = (value?: string | null) => (value ? value.slice(0, 16) : "");
const csvFormats = (value: string) =>
  value
    .split(/[,\n]/)
    .map((item) => item.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);

export default function EventSettingsPage() {
  const { eventId } = useParams();
  const router = useRouter();
  const eventIdValue = eventId as string;
  const { user } = useAuthStore();
  
  const { data: event, isLoading: eventLoading } = useEvent(eventIdValue);
  const updateEvent = useUpdateEvent(eventIdValue);

  const isAdmin = useMemo(() => {
    return user && ["super_admin", "organiser", "admin"].includes(user.role);
  }, [user]);

  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  useEffect(() => {
    if (!isAdmin && (activeTab === "team" || activeTab === "danger")) {
      setActiveTab("profile");
    }
  }, [isAdmin, activeTab]);

  useEffect(() => {
    if (activeTab === "team" && isAdmin) {
      setUsersLoading(true);
      apiClient.get<any[]>("/users")
        .then((res) => {
          // Filter users who have at least one assignment for this event
          const assigned = res.filter((u: any) =>
            u.assignments?.some((a: any) => a.event_id === eventIdValue)
          );
          setUsers(assigned);
        })
        .catch((err) => {
          console.error("Failed to fetch event users", err);
          toast.error("Failed to load team access list.");
        })
        .finally(() => {
          setUsersLoading(false);
        });
    }
  }, [activeTab, isAdmin, eventIdValue]);

  const [form, setForm] = useState({
    name: "",
    short_code: "",
    organiser: "",
    location: "",
    venue_name: "",
    start_date: "",
    end_date: "",
    status: "draft" as ProgramStatus,
    enable_posters: true,
    upload_deadline: "",
    max_file_size_mb: 500,
    allowed_formats: "pptx, pdf, mp4, zip, folder",
    enable_moderator: true,
    enable_whatsapp: false,
    enable_srr: true,
    enable_signage: true,
    enable_webhooks: false,
    enable_auto_approval: false,
    timezone: "UTC",
  });

  useEffect(() => {
    if (!event) return;
    const toggles = (event as any).feature_toggles || {};
    setForm((current) => ({
      ...current,
      name: event.name || "",
      short_code: event.short_code || "",
      organiser: (event as any).organizer_name || event.created_by || "",
      location: event.location || "",
      venue_name: event.venue_name || "",
      start_date: toDateInput(event.start_date),
      end_date: toDateInput(event.end_date),
      status: statusToProgram(event.status),
      upload_deadline: toDateTimeInput(event.upload_deadline),
      max_file_size_mb: event.max_file_size_mb || 500,
      allowed_formats: (event.allowed_formats?.length ? event.allowed_formats : ["pptx", "pdf", "mp4", "zip", "folder"]).join(", "),
      timezone: event.timezone || "UTC",
      // Feature Toggles
      enable_posters: toggles.enable_posters ?? true,
      enable_moderator: toggles.enable_moderator ?? true,
      enable_whatsapp: toggles.enable_whatsapp ?? false,
      enable_srr: toggles.enable_srr ?? true,
      enable_signage: toggles.enable_signage ?? true,
      enable_webhooks: toggles.enable_webhooks ?? false,
      enable_auto_approval: toggles.enable_auto_approval ?? false,
    }));
  }, [event]);

  const allowedFormats = useMemo(() => csvFormats(form.allowed_formats), [form.allowed_formats]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    try {
      const eventPayload: Record<string, unknown> = {
        name: form.name,
        short_code: form.short_code.toUpperCase(),
        organizer_name: form.organiser || null,
        location: form.location || null,
        venue_name: form.venue_name || null,
        status: programToStatus(form.status),
        timezone: form.timezone,
        upload_deadline: form.upload_deadline || null,
        max_file_size_mb: Number(form.max_file_size_mb),
        allowed_formats: allowedFormats,
        feature_toggles: {
          enable_posters: form.enable_posters,
          enable_moderator: form.enable_moderator,
          enable_whatsapp: form.enable_whatsapp,
          enable_srr: form.enable_srr,
          enable_signage: form.enable_signage,
          enable_webhooks: form.enable_webhooks,
          enable_auto_approval: form.enable_auto_approval,
        },
      };
      if (form.start_date) eventPayload.start_date = form.start_date;
      if (form.end_date) eventPayload.end_date = form.end_date;

      await updateEvent.mutateAsync(eventPayload);
      toast.success("Event settings saved successfully.");
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      const message = Array.isArray(detail)
        ? detail.map((d: any) => d.msg ?? JSON.stringify(d)).join("; ")
        : detail ?? error?.message ?? "Could not save configuration.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearData = async () => {
    if (!window.confirm("ARE YOU SURE? This will PERMANENTLY DELETE all sessions, speakers, rooms, and import history for this event. This cannot be undone.")) {
      return;
    }

    setIsClearing(true);
    try {
      await apiClient.post(`/events/${eventIdValue}/clear-data`);
      toast.success("All event data has been cleared.");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      toast.error("Failed to clear event data.");
    } finally {
      setIsClearing(false);
    }
  };

  const tabs = useMemo(() => {
    const list: { id: SettingsTab; label: string; icon: any }[] = [
      { id: "profile", label: "Event Profile", icon: Globe },
      { id: "policies", label: "Policies & Workflows", icon: Sliders },
    ];
    if (isAdmin) {
      list.push(
        { id: "team", label: "Team Access", icon: Shield },
        { id: "danger", label: "Danger Zone", icon: Trash2 }
      );
    }
    return list;
  }, [isAdmin]);

  return (
    <div className="space-y-10 animate-fade-in pb-20">
      <header className="flex flex-col md:flex-row items-center justify-between gap-6 px-2">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] mb-2 text-glow-indigo">
            Event <span className="text-[var(--pri)]">Settings</span>
          </h1>
          <p className="text-[13px] font-bold text-muted uppercase tracking-[0.3em]">
            Configure event workspace, ingestion options, and security policies
          </p>
        </div>

        {isAdmin && (
          <Button
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="h-12 px-8 rounded-full bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] border-0 shadow-[0_15px_30px_color-mix(in_srgb,var(--pri)_30%,transparent)] flex items-center gap-2"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Apply Configuration
          </Button>
        )}
      </header>

      {/* Tabs Navigation */}
      <nav className="flex w-fit flex-wrap items-center gap-2 rounded-full border border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] p-2 glass-3d">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "relative flex items-center gap-2 rounded-full px-6 py-3 text-[11px] font-black uppercase tracking-widest transition-all",
              activeTab === tab.id ? "text-[var(--text)]" : "text-muted hover:text-[var(--text)]"
            )}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="event-settings-nav"
                className="absolute inset-0 rounded-full bg-[var(--pri)] shadow-lg z-[-1]"
              />
            )}
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab Panels */}
      <AnimatePresence mode="wait">
        {activeTab === "profile" && (
          <motion.section
            key="profile"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid gap-10 lg:grid-cols-2"
          >
            {/* General Info Card */}
            <Card className="glass-3d border-default rounded-[3rem] p-10 space-y-8">
              <div className="flex items-center gap-4 mb-2">
                <div className="h-12 w-12 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center">
                  <Globe className="h-6 w-6 text-[var(--pri)]" />
                </div>
                <h3 className="text-xl font-black text-[var(--text)] tracking-tight">Public Profile</h3>
              </div>

              <div className="space-y-6">
                <Field
                  icon={Globe}
                  label="Event Name"
                  value={form.name}
                  disabled={!isAdmin}
                  onChange={(val) => setForm({ ...form, name: val })}
                  placeholder="e.g. Annual Tech Symposium"
                />
                
                <div className="grid grid-cols-2 gap-6">
                  <Field
                    icon={Shield}
                    label="Slug Short Code"
                    value={form.short_code}
                    disabled={!isAdmin}
                    onChange={(val) => setForm({ ...form, short_code: val.toUpperCase() })}
                    placeholder="e.g. TECH2026"
                  />
                  <Field
                    icon={Users}
                    label="Organiser Name"
                    value={form.organiser}
                    disabled={!isAdmin}
                    onChange={(val) => setForm({ ...form, organiser: val })}
                    placeholder="e.g. Ingress Incorp"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Field
                      icon={Clock}
                      label="Event Timezone"
                      value={form.timezone}
                      disabled={!isAdmin}
                      onChange={(val) => setForm({ ...form, timezone: val })}
                      placeholder="e.g. Asia/Kolkata"
                    />
                    <p className="px-1 text-[9px] font-bold text-muted">e.g. UTC, Asia/Kolkata, Europe/London</p>
                  </div>

                  <div className="space-y-3">
                    <label className="px-1 text-[10px] font-black uppercase tracking-widest text-muted">Event Status</label>
                    <div className="grid grid-cols-3 gap-2 rounded-2xl border border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] p-1">
                      {(["draft", "final", "updated"] as const).map((item) => (
                        <button
                          key={item}
                          type="button"
                          disabled={!isAdmin}
                          onClick={() => setForm({ ...form, status: item })}
                          className={cn(
                            "rounded-xl px-2 py-3 text-[9px] font-black uppercase tracking-wider transition-all",
                            form.status === item ? "bg-[var(--pri)] text-[var(--text)]" : "text-muted hover:text-[var(--text)]",
                            !isAdmin && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Location & Dates Card */}
            <Card className="glass-3d border-default rounded-[3rem] p-10 space-y-8">
              <div className="flex items-center gap-4 mb-2">
                <div className="h-12 w-12 rounded-xl bg-[var(--sec)]/10 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-[var(--sec)]" />
                </div>
                <h3 className="text-xl font-black text-[var(--text)] tracking-tight">Venue Details</h3>
              </div>

              <div className="space-y-6">
                <Field
                  icon={MapPin}
                  label="City & Location"
                  value={form.location}
                  disabled={!isAdmin}
                  onChange={(val) => setForm({ ...form, location: val })}
                  placeholder="e.g. Mumbai, Maharashtra"
                />
                <Field
                  icon={Building2}
                  label="Venue Center"
                  value={form.venue_name}
                  disabled={!isAdmin}
                  onChange={(val) => setForm({ ...form, venue_name: val })}
                  placeholder="e.g. Grand Convention Plaza"
                />

                <div className="space-y-3">
                  <label className="px-1 text-[10px] font-black uppercase tracking-[0.25em] text-muted">Operations Duration</label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-muted px-1">Start Date</span>
                      <Input
                        type="date"
                        value={form.start_date}
                        disabled={!isAdmin}
                        onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                        className="h-14 rounded-2xl border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-5 text-[13px] font-bold text-[var(--text)] [color-scheme:dark] disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-muted px-1">End Date</span>
                      <Input
                        type="date"
                        value={form.end_date}
                        disabled={!isAdmin}
                        onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                        className="h-14 rounded-2xl border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-5 text-[13px] font-bold text-[var(--text)] [color-scheme:dark] disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </motion.section>
        )}

        {activeTab === "policies" && (
          <motion.section
            key="policies"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid gap-10 lg:grid-cols-[1fr_420px]"
          >
            {/* Left: Main Policies */}
            <div className="space-y-8">
              <SettingsPanel title="Submission Policies" icon={FileArchive}>
                <div className="grid gap-8 md:grid-cols-2">
                  <div className="space-y-6">
                    <div>
                      <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">Upload Deadline</label>
                      <Input
                        type="datetime-local"
                        value={form.upload_deadline}
                        disabled={!isAdmin}
                        onChange={(e) => setForm({ ...form, upload_deadline: e.target.value })}
                        className="h-14 rounded-2xl border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-5 text-[13px] font-bold text-[var(--text)] [color-scheme:dark] disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">Max File Size (MB)</label>
                      <div className="flex items-center gap-3">
                        <Input
                          type="number"
                          min={1}
                          max={2048}
                          value={form.max_file_size_mb}
                          disabled={!isAdmin}
                          onChange={(e) => setForm({ ...form, max_file_size_mb: Number(e.target.value) })}
                          className="h-14 rounded-2xl border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-5 text-[13px] font-bold text-[var(--text)] disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                        <span className="text-[10px] font-black uppercase text-muted">Limit</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted">Allowed File Extensions</label>
                    <textarea
                      value={form.allowed_formats}
                      disabled={!isAdmin}
                      onChange={(e) => setForm({ ...form, allowed_formats: e.target.value })}
                      className="min-h-[148px] w-full rounded-2xl border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] p-5 text-[12px] font-bold text-[var(--text)] outline-none transition-all focus:border-[var(--pri)]/50 focus:ring-1 focus:ring-[var(--pri)]/20 disabled:opacity-60 disabled:cursor-not-allowed"
                      placeholder="pptx, pdf, zip..."
                    />
                  </div>
                </div>
              </SettingsPanel>

              <SettingsPanel title="Workflow Controls" icon={ToggleLeft}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ToggleRow label="Moderation Flow" value={form.enable_moderator} disabled={!isAdmin} onChange={(val) => setForm({ ...form, enable_moderator: val })} />
                  <ToggleRow label="Speaker Ready Room" value={form.enable_srr} disabled={!isAdmin} onChange={(val) => setForm({ ...form, enable_srr: val })} />
                  <ToggleRow label="WhatsApp Reminders" value={form.enable_whatsapp} disabled={!isAdmin} onChange={(val) => setForm({ ...form, enable_whatsapp: val })} />
                  <ToggleRow label="Venue Signage" value={form.enable_signage} disabled={!isAdmin} onChange={(val) => setForm({ ...form, enable_signage: val })} />
                  <ToggleRow label="Webhook Triggers" value={form.enable_webhooks} disabled={!isAdmin} onChange={(val) => setForm({ ...form, enable_webhooks: val })} />
                  <ToggleRow label="ePoster Workflow" value={form.enable_posters} disabled={!isAdmin} onChange={(val) => setForm({ ...form, enable_posters: val })} />
                  <ToggleRow label="Automatic Approval" value={form.enable_auto_approval} disabled={!isAdmin} onChange={(val) => setForm({ ...form, enable_auto_approval: val })} />
                </div>
              </SettingsPanel>
            </div>

            {/* Right Instructions */}
            <div className="space-y-6">
              <Card className="glass-3d rounded-[2.5rem] border-default p-8 bg-gradient-to-br from-[var(--pri)]/5 to-transparent">
                <Shield className="mb-4 h-8 w-8 text-[var(--pri)]" />
                <h4 className="mb-2 text-[12px] font-black uppercase tracking-widest text-[var(--text)]">Submission Logic</h4>
                <p className="text-[11px] font-medium leading-relaxed text-muted">
                  Allowed file format strings are parsed as comma-separated values. Upload limits and timezone offsets are immediately propagated to the presenter submission portal.
                </p>
              </Card>
            </div>
          </motion.section>
        )}

        {activeTab === "team" && (
          <motion.section
            key="team"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <Card className="glass-3d border-default rounded-[2.5rem] p-10">
              <div className="flex items-center gap-4 mb-10">
                <div className="h-12 w-12 rounded-xl bg-[var(--warn)]/10 flex items-center justify-center">
                  <Shield className="h-6 w-6 text-[var(--warn)]" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-[var(--text)] tracking-tight">Access Control</h3>
                  <p className="text-[11px] font-black text-muted uppercase tracking-widest mt-1">Users assigned to this event</p>
                </div>
              </div>

              {usersLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <Skeleton className="h-28 rounded-3xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)]" />
                  <Skeleton className="h-28 rounded-3xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)]" />
                  <Skeleton className="h-28 rounded-3xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)]" />
                </div>
              ) : users.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {users.map((u) => (
                    <div key={u.id} className="p-6 rounded-3xl glass-3d border-default flex items-center justify-between group transition-all hover:bg-[var(--pri)]/5">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="h-10 w-10 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-default flex items-center justify-center text-muted group-hover:text-[var(--pri)] transition-all shrink-0">
                          <Users className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold text-[var(--text)] truncate">{u.first_name} {u.last_name}</p>
                          <p className="text-[10px] font-mono text-muted truncate">{u.email}</p>
                          <Badge variant="outline" className="border-default text-[8px] font-black uppercase tracking-wider px-2 py-0.5 mt-1.5 bg-[var(--pri)]/5 text-[var(--pri)]">
                            {u.role}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-20 text-center flex flex-col items-center justify-center border border-default border-dashed rounded-3xl">
                  <Users className="h-12 w-12 text-muted mb-4" />
                  <h4 className="text-[12px] font-black text-muted uppercase tracking-[0.2em] mb-1">No Assigned Users</h4>
                  <p className="text-[10px] text-muted uppercase tracking-tighter">No team members have been assigned to this event yet</p>
                </div>
              )}
            </Card>
          </motion.section>
        )}

        {activeTab === "danger" && (
          <motion.section
            key="danger"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid gap-10 lg:grid-cols-[1fr_420px]"
          >
            {/* Left danger actions */}
            <Card className="glass-3d border-red-500/20 bg-red-500/5 rounded-[3rem] p-10 space-y-8">
              <div className="flex items-center gap-4 mb-2">
                <div className="h-12 w-12 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <Trash2 className="h-6 w-6 text-red-500" />
                </div>
                <h3 className="text-xl font-black text-red-500 tracking-tight">Factory Telemetry Reset</h3>
              </div>

              <div className="space-y-4">
                <p className="text-sm font-bold text-[var(--text)]">
                  Permanently delete all sessions, rooms, speakers, and file records mapped to this event short-code.
                </p>
                <p className="text-xs text-muted leading-relaxed">
                  This actions wipes all database tables for this event ID. Presenters will no longer be able to log in, and all uploaded session presentations are unlinked.
                  <span className="block mt-2 font-black text-red-400 uppercase tracking-wider">This action is non-reversible.</span>
                </p>
                
                <div className="pt-4">
                  <Button
                    type="button"
                    onClick={handleClearData}
                    disabled={isClearing}
                    className="h-14 px-10 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-black uppercase tracking-widest text-[11px] border-0 shadow-lg shadow-red-500/20 flex items-center gap-2"
                  >
                    {isClearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Confirm Complete Factory Reset
                  </Button>
                </div>
              </div>
            </Card>

            {/* Right warning panel */}
            <div className="space-y-6">
              <Card className="glass-3d border-default rounded-[2.5rem] p-8">
                <AlertCircle className="mb-4 h-8 w-8 text-amber-500" />
                <h4 className="mb-2 text-[12px] font-black uppercase tracking-widest text-[var(--text)]">Critical Notice</h4>
                <p className="text-[11px] font-medium leading-relaxed text-muted">
                  Clearing data should only be executed prior to event commencement. Active on-site check-in sessions will terminate immediately upon reset.
                </p>
              </Card>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({ icon: Icon, label, value, onChange, placeholder, className, disabled }: { icon: any; label: string; value: string; onChange: (val: string) => void; placeholder?: string; className?: string; disabled?: boolean }) {
  return (
    <div className={cn("space-y-3", className)}>
      <label className="px-1 text-[10px] font-black uppercase tracking-widest text-muted">{label}</label>
      <div className="relative">
        <Icon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <Input
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-14 rounded-2xl border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] pl-12 pr-5 text-[14px] font-bold text-[var(--text)] focus-visible:ring-0 focus:border-[var(--pri)]/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>
    </div>
  );
}

function SettingsPanel({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <Card className="glass-3d rounded-[3rem] border-default p-8">
      <div className="mb-8 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--pri)]/15 text-[var(--pri)]">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="text-[14px] font-black uppercase tracking-widest text-[var(--text)]">{title}</h3>
      </div>
      {children}
    </Card>
  );
}

function ToggleRow({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (val: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-default bg-[color-mix(in_srgb,var(--text)_3%,transparent)] p-5 group hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all">
      <div className="space-y-1">
        <span className="text-[13px] font-bold text-[var(--text)]">{label}</span>
        <p className="text-[9px] font-black text-muted uppercase tracking-widest">{value ? 'Active' : 'Disabled'}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={cn(
          "relative h-8 w-14 rounded-full border-2 p-1 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] shadow-inner",
          value ? "border-[var(--pri)] bg-[var(--pri)] shadow-[0_0_15px_color-mix(in_srgb,var(--pri)_40%,transparent)]" : "border-default bg-[color-mix(in_srgb,var(--text)_10%,transparent)]",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <motion.span
          animate={{ x: value ? 24 : 0, scale: value ? 1.1 : 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="block h-5 w-5 rounded-full bg-[var(--text)] shadow-[0_2px_5px_rgba(0,0,0,0.3)]"
        />
      </button>
    </div>
  );
}
