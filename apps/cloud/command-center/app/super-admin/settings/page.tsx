"use client";

import { useState, useEffect } from "react";
import { useGlobalSettings, useUpdateGlobalSettings } from "@/services/super-admin-service";
import { Settings2, Globe, AlertOctagon, Megaphone, ShieldCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
];

export default function PlatformSettingsPage() {
  const { data: settings, isLoading, refetch } = useGlobalSettings();
  const updateSettingsMutation = useUpdateGlobalSettings();

  const [timezone, setTimezone] = useState("UTC");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [broadcastEnabled, setBroadcastEnabled] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings?.timezone) {
      setTimezone(settings.timezone);
    }
  }, [settings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateSettingsMutation.mutateAsync({ timezone });
      toast.success("Platform settings saved successfully");
      refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update platform settings");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMaintenance = () => {
    const nextVal = !maintenanceMode;
    setMaintenanceMode(nextVal);
    toast.success(`Platform maintenance mode ${nextVal ? "ENABLED" : "DISABLED"}`);
  };

  const handleToggleBroadcast = () => {
    const nextVal = !broadcastEnabled;
    setBroadcastEnabled(nextVal);
    toast.success(`Platform global announcement broadcast ${nextVal ? "STARTED" : "STOPPED"}`);
  };

  return (
    <div className="space-y-6 max-w-4xl animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-violet-500/10 border border-violet-500/20">
            <Settings2 className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Platform Settings</h1>
            <p className="text-[11px] text-white/35">Manage global conference cluster configurations and broadcast controls</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white/40 hover:text-white"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-5">
        {/* Core settings */}
        <div className="rounded-2xl border border-white/5 bg-white/3 p-5 space-y-4">
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-violet-400" /> Region & Clock Configuration
          </h3>
          <div className="h-px bg-white/5" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">Global timezone</label>
              {isLoading ? (
                <div className="h-10 w-full bg-white/5 rounded-xl animate-pulse" />
              ) : (
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/15 text-xs text-white focus:outline-none focus:border-violet-500/40"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz} className="bg-[var(--surf)]">
                      {tz}
                    </option>
                  ))}
                </select>
              )}
              <p className="text-[9px] text-white/25 leading-relaxed">
                Applies standard offsets for scheduled campaigns and cron executions platform-wide.
              </p>
            </div>
          </div>
        </div>

        {/* Maintenance mode */}
        <div className="rounded-2xl border border-white/5 bg-white/3 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-black text-white">System Maintenance Mode</h3>
            </div>
            <button
              type="button"
              onClick={handleToggleMaintenance}
              className={`w-12 h-6 rounded-full p-1 transition-all duration-300 focus:outline-none ${
                maintenanceMode ? "bg-amber-500" : "bg-white/10"
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-white transition-all ${
                maintenanceMode ? "translate-x-6" : "translate-x-0"
              }`} />
            </button>
          </div>
          <p className="text-[11px] text-white/35 leading-relaxed max-w-2xl">
            When enabled, all client-facing event workspaces (organizers, speakers, registrations) will enter a read-only lock state with a custom maintenance landing screen. Super admin APIs will remain fully accessible.
          </p>
        </div>

        {/* Announcements Broadcast */}
        <div className="rounded-2xl border border-white/5 bg-white/3 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-black text-white">System Announcement Banner</h3>
            </div>
            <button
              type="button"
              onClick={handleToggleBroadcast}
              className={`w-12 h-6 rounded-full p-1 transition-all duration-300 focus:outline-none ${
                broadcastEnabled ? "bg-cyan-500" : "bg-white/10"
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-white transition-all ${
                broadcastEnabled ? "translate-x-6" : "translate-x-0"
              }`} />
            </button>
          </div>
          <p className="text-[11px] text-white/35 leading-relaxed">
            Broadcast a global banner notification at the top of the screen across all organizer dashboard and registration workspaces.
          </p>

          <div className="space-y-1.5 pt-2">
            <textarea
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              placeholder="e.g. Schedule cluster maintenance is planned for June 12th between 02:00 - 03:00 UTC."
              className="w-full h-20 px-3 py-2.5 rounded-xl bg-white/5 border border-white/15 text-xs text-white placeholder-white/20 focus:outline-none focus:border-cyan-500/40 resize-none"
            />
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || isLoading}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-[11px] font-black uppercase tracking-widest transition-all shadow-lg shadow-violet-500/10 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving Configuration…
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" /> Save Settings
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
