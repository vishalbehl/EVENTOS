"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Cloud, Lock, Database, Loader2, CheckCircle, Server, RefreshCw } from "lucide-react";

export default function AdminSetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cloudToken, setCloudToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/venue/admin/cloud-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) throw new Error("Invalid cloud credentials");
      const data = await res.json();
      setCloudToken(data.access_token);
      
      // Fetch organizations
      const orgRes = await fetch("/api/v1/venue/admin/cloud-organizations", {
        headers: { "Authorization": `Bearer ${data.access_token}` }
      });
      if (!orgRes.ok) throw new Error("Failed to fetch organizations");
      const orgData = await orgRes.json();
      setOrganizations(orgData);
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOrgChange = async (orgId: string) => {
    setSelectedOrgId(orgId);
    setLoading(true);
    try {
      const evRes = await fetch(`/api/v1/venue/admin/cloud-events?organization_id=${orgId}`, {
        headers: { "Authorization": `Bearer ${cloudToken}` }
      });
      if (!evRes.ok) throw new Error("Failed to fetch events");
      const evData = await evRes.json();
      setEvents(evData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (!selectedEventId || !selectedOrgId) return;
    setStep(3);
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/venue/admin/sync-event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cloudToken}`
        },
        body: JSON.stringify({
          event_id: selectedEventId,
          organization_id: selectedOrgId
        })
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || "Sync failed");
      }
      setLoading(false);
      setStep(4);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--base)] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-xl overflow-hidden">
        
        <div className="bg-[var(--surf)] border-b border-[var(--border)] p-8 text-center">
          <div className="w-16 h-16 bg-[var(--pri)] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg text-[var(--primary-contrast)]">
            <Server className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-[var(--text)]">Venue Server Setup</h2>
          <p className="text-[var(--muted)] mt-2 text-sm">Initialize local edge node with cloud configuration</p>
        </div>

        <div className="p-8">
          
          {/* Progress Indicators */}
          <div className="flex items-center justify-center space-x-4 mb-8">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${step >= 1 ? 'bg-[var(--pri)] text-[var(--primary-contrast)]' : 'bg-[var(--surf)] text-[var(--muted)] border border-[var(--border)]'}`}>1</div>
            <div className={`w-12 h-1 ${step >= 2 ? 'bg-[var(--pri)]' : 'bg-[var(--border)]'}`} />
            <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${step >= 2 ? 'bg-[var(--pri)] text-[var(--primary-contrast)]' : 'bg-[var(--surf)] text-[var(--muted)] border border-[var(--border)]'}`}>2</div>
            <div className={`w-12 h-1 ${step >= 3 ? 'bg-[var(--pri)]' : 'bg-[var(--border)]'}`} />
            <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${step >= 4 ? 'bg-[var(--pri)] text-[var(--primary-contrast)]' : 'bg-[var(--surf)] text-[var(--muted)] border border-[var(--border)]'}`}>3</div>
          </div>

          {error && (
            <div className="bg-red-500/10 text-red-500 border border-red-500/20 p-4 rounded-xl text-sm font-semibold mb-6 flex items-center gap-3">
              <Lock className="w-5 h-5" />
              {error}
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handleLogin} className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center mb-6">
                <h3 className="text-lg font-bold text-[var(--text)]">Cloud Authentication</h3>
                <p className="text-sm text-[var(--muted)]">Login with your Organizer account to connect the node.</p>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-[var(--text)] mb-1.5">Email Address</label>
                <div className="relative">
                  <Cloud className="w-5 h-5 text-[var(--muted)] absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-[var(--surf)] border border-[var(--border)] text-[var(--text)] rounded-xl focus:border-[var(--pri)] outline-none transition-all"
                    placeholder="admin@eventos.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--text)] mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="w-5 h-5 text-[var(--muted)] absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-[var(--surf)] border border-[var(--border)] text-[var(--text)] rounded-xl focus:border-[var(--pri)] outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[var(--pri)] hover:opacity-90 text-[var(--primary-contrast)] rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Connect to Cloud"}
              </button>
            </form>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center mb-6">
                <h3 className="text-lg font-bold text-[var(--text)]">Select Event Configuration</h3>
                <p className="text-sm text-[var(--muted)]">Choose the event data to download to this local node.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--text)] mb-1.5">Organization</label>
                <select
                  value={selectedOrgId}
                  onChange={(e) => handleOrgChange(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[var(--surf)] border border-[var(--border)] text-[var(--text)] rounded-xl focus:border-[var(--pri)] outline-none"
                >
                  <option value="">-- Select Organization --</option>
                  {organizations.map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              </div>

              {selectedOrgId && (
                <div>
                  <label className="block text-sm font-semibold text-[var(--text)] mb-1.5">Event</label>
                  {loading && events.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-[var(--muted)] p-2"><Loader2 className="w-4 h-4 animate-spin"/> Loading events...</div>
                  ) : (
                    <select
                      value={selectedEventId}
                      onChange={(e) => setSelectedEventId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[var(--surf)] border border-[var(--border)] text-[var(--text)] rounded-xl focus:border-[var(--pri)] outline-none"
                    >
                      <option value="">-- Select Event --</option>
                      {events.map(ev => (
                        <option key={ev.id} value={ev.id}>{ev.name} ({new Date(ev.start_date).toLocaleDateString()})</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <button
                onClick={handleSync}
                disabled={!selectedEventId || loading}
                className="w-full py-3 bg-[var(--pri)] hover:opacity-90 text-[var(--primary-contrast)] rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5" />}
                {loading ? "Initializing..." : "Pull Event Data & Sync"}
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="text-center py-12 animate-in fade-in zoom-in duration-500">
              <RefreshCw className="w-16 h-16 text-[var(--pri)] animate-spin mx-auto mb-6" />
              <h3 className="text-xl font-bold text-[var(--text)]">Syncing Local Database...</h3>
              <p className="text-[var(--muted)] mt-2 max-w-sm mx-auto">
                Downloading participants, sessions, print templates, and authorized staff accounts. This may take a moment.
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="text-center py-10 animate-in fade-in zoom-in duration-500">
              <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-500 border border-emerald-500/20">
                <CheckCircle className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-bold text-[var(--text)]">Setup Complete!</h3>
              <p className="text-[var(--muted)] mt-2 mb-8 max-w-sm mx-auto">
                The Venue Server is successfully provisioned and ready for offline operations.
              </p>
              <button
                onClick={() => router.push("/admin")}
                className="w-full py-3 bg-[var(--pri)] hover:opacity-90 text-[var(--primary-contrast)] rounded-xl font-bold transition-all shadow-md"
              >
                Go to Dashboard
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
