"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Bell, Camera, FileText, KeyRound, Monitor, Printer, Save, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/store/use-auth-store";

type Mode = "admin" | "registration" | "scanning" | "self_checkin";

const MODE_COPY: Record<Mode, { title: string; eyebrow: string; description: string }> = {
  admin: {
    title: "Administrator profile",
    eyebrow: "Admin settings",
    description: "Your identity, security, notifications, and report defaults for this venue node.",
  },
  registration: {
    title: "Registration operator profile",
    eyebrow: "Desk settings",
    description: "Your identity, assigned desk, and personal badge-printing preferences.",
  },
  scanning: {
    title: "Gate operator profile",
    eyebrow: "Scanner settings",
    description: "Your identity, assigned checkpoint, and personal camera and scan-feedback preferences.",
  },
  self_checkin: {
    title: "Self check-in + printing profile",
    eyebrow: "Kiosk settings",
    description: "Your identity, assigned kiosk, preferred camera, printer, and participant self-service defaults.",
  },
};

export default function ModeSettingsPage({ mode }: { mode: Mode }) {
  const { user, updateUser } = useAuthStore();
  const copy = MODE_COPY[mode];
  const initialPreferences = useMemo(() => user?.mode_preferences?.[mode] || {}, [mode, user?.mode_preferences]);
  const [profile, setProfile] = useState({ first_name: "", last_name: "", email: "", phone: "" });
  const [preferences, setPreferences] = useState<Record<string, any>>({});
  const [passwords, setPasswords] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setProfile({ first_name: user.first_name || "", last_name: user.last_name || "", email: user.email || "", phone: user.phone || "" });
    setPreferences(initialPreferences);
  }, [initialPreferences, user]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile.first_name.trim() || !profile.email.trim()) {
      toast.error("First name and email are required.");
      return;
    }
    if (passwords.new_password && passwords.new_password !== passwords.confirm_password) {
      toast.error("New password and confirmation do not match.");
      return;
    }
    setSaving(true);
    try {
      const updated = await apiClient.patch<any>("/auth/me", profile);
      await apiClient.put(`/auth/me/preferences/${mode}`, { preferences });
      if (passwords.new_password) {
        await apiClient.post("/auth/change-password", {
          current_password: passwords.current_password,
          new_password: passwords.new_password,
        });
      }
      updateUser({ ...updated, mode_preferences: { ...(user?.mode_preferences || {}), [mode]: preferences } });
      setPasswords({ current_password: "", new_password: "", confirm_password: "" });
      toast.success("Profile and preferences saved.");
    } catch (error: any) {
      toast.error(error?.message || "Settings could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="mx-auto w-full max-w-6xl space-y-5 pb-12">
      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="flex flex-col gap-4 border-b border-[var(--border)] p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid size-12 place-items-center rounded-xl bg-[var(--pri)] text-[var(--primary-contrast)]"><User className="size-6" /></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--pri)]">{copy.eyebrow}</p>
              <h1 className="text-2xl font-black tracking-tight text-[var(--text)]">{copy.title}</h1>
              <p className="mt-1 text-xs font-medium text-[var(--muted)]">{copy.description}</p>
            </div>
          </div>
          <Button type="submit" disabled={saving} className="h-10 gap-2 bg-[var(--pri)] px-5 text-xs font-black text-[var(--primary-contrast)]">
            <Save className="size-4" /> {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <SettingsCard icon={User} title="Account profile">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name"><Input value={profile.first_name} onChange={(e) => setProfile({ ...profile, first_name: e.target.value })} /></Field>
            <Field label="Last name"><Input value={profile.last_name} onChange={(e) => setProfile({ ...profile, last_name: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></Field>
            <Field label="Phone"><Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></Field>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surf)] px-4 py-3 text-xs">
            <span className="font-semibold text-[var(--muted)]">Account role</span>
            <span className="font-black uppercase text-[var(--text)]">{user?.role || "operator"}</span>
          </div>
        </SettingsCard>

        <SettingsCard icon={KeyRound} title="Password and security">
          <div className="space-y-4">
            <Field label="Current password"><Input type="password" autoComplete="current-password" value={passwords.current_password} onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="New password"><Input type="password" autoComplete="new-password" value={passwords.new_password} onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })} /></Field>
              <Field label="Confirm password"><Input type="password" autoComplete="new-password" value={passwords.confirm_password} onChange={(e) => setPasswords({ ...passwords, confirm_password: e.target.value })} /></Field>
            </div>
            <p className="text-[11px] font-medium text-[var(--muted)]">Leave these fields blank to keep the current password. New passwords require at least 10 characters.</p>
          </div>
        </SettingsCard>

        {mode === "admin" && (
          <SettingsCard icon={FileText} title="Admin preferences">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Timezone"><Select value={preferences.timezone || "Asia/Kolkata"} onChange={(value) => setPreferences({ ...preferences, timezone: value })} options={["Asia/Kolkata", "UTC", "Asia/Singapore", "Europe/London", "America/New_York"]} /></Field>
              <Field label="Default report format"><Select value={preferences.report_format || "pdf"} onChange={(value) => setPreferences({ ...preferences, report_format: value })} options={["pdf", "docx"]} /></Field>
            </div>
            <Toggle icon={Bell} label="Operational notifications" checked={preferences.notifications !== false} onChange={(checked) => setPreferences({ ...preferences, notifications: checked })} />
          </SettingsCard>
        )}

        {mode === "registration" && (
          <SettingsCard icon={Printer} title="Registration desk preferences">
            <Field label="Assigned desk"><Input value={preferences.assigned_desk || "Not assigned"} disabled /></Field>
            <div className="mt-4"><Field label="Preferred printer"><Input value={preferences.preferred_printer || ""} placeholder="Select by configured printer name" onChange={(e) => setPreferences({ ...preferences, preferred_printer: e.target.value })} /></Field></div>
            <Toggle icon={Printer} label="Print badge after registration" checked={Boolean(preferences.auto_print)} onChange={(checked) => setPreferences({ ...preferences, auto_print: checked })} />
          </SettingsCard>
        )}

        {mode === "scanning" && (
          <SettingsCard icon={Camera} title="Scanning preferences">
            <Field label="Assigned station"><Input value={preferences.assigned_station || "Not assigned"} disabled /></Field>
            <div className="mt-4"><Field label="Preferred camera"><Input value={preferences.preferred_camera || ""} placeholder="Camera device name" onChange={(e) => setPreferences({ ...preferences, preferred_camera: e.target.value })} /></Field></div>
            <Toggle icon={Monitor} label="Play scan confirmation sound" checked={preferences.scan_sound !== false} onChange={(checked) => setPreferences({ ...preferences, scan_sound: checked })} />
            <Toggle icon={ShieldCheck} label="Use vibration feedback when supported" checked={Boolean(preferences.haptic_feedback)} onChange={(checked) => setPreferences({ ...preferences, haptic_feedback: checked })} />
          </SettingsCard>
        )}

        {mode === "self_checkin" && (
          <SettingsCard icon={Camera} title="Self check-in kiosk preferences">
            <Field label="Assigned kiosk"><Input value={preferences.assigned_kiosk || "Not assigned"} disabled /></Field>
            <div className="mt-4"><Field label="Preferred camera"><Input value={preferences.preferred_camera || ""} placeholder="Camera device name" onChange={(e) => setPreferences({ ...preferences, preferred_camera: e.target.value })} /></Field></div>
            <div className="mt-4"><Field label="Preferred printer"><Input value={preferences.preferred_printer || ""} placeholder="Printer name or queue" onChange={(e) => setPreferences({ ...preferences, preferred_printer: e.target.value })} /></Field></div>
            <Toggle icon={Monitor} label="Play check-in confirmation sound" checked={preferences.confirmation_sound !== false} onChange={(checked) => setPreferences({ ...preferences, confirmation_sound: checked })} />
            <Toggle icon={Printer} label="Offer badge print after successful check-in" checked={preferences.offer_print !== false} onChange={(checked) => setPreferences({ ...preferences, offer_print: checked })} />
          </SettingsCard>
        )}
      </div>
    </form>
  );
}

function SettingsCard({ icon: Icon, title, children }: { icon: typeof User; title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm"><div className="mb-5 flex items-center gap-2 border-b border-[var(--border)] pb-3"><Icon className="size-4 text-[var(--pri)]" /><h2 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">{title}</h2></div>{children}</section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1.5"><span className="block text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">{label}</span>{children}</label>;
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surf)] px-3 text-xs font-bold text-[var(--text)]">{options.map((option) => <option key={option} value={option}>{option.toUpperCase()}</option>)}</select>;
}

function Toggle({ icon: Icon, label, checked, onChange }: { icon: typeof User; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="mt-4 flex cursor-pointer items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surf)] px-4 py-3"><span className="flex items-center gap-2 text-xs font-bold text-[var(--text)]"><Icon className="size-4 text-[var(--pri)]" />{label}</span><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--pri)]" /></label>;
}
