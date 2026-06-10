"use client";

import { useState } from "react";
import { useAuthStore } from "@/store/use-auth-store";
import { useEffect } from "react";
import { Code2, Key, RefreshCw, Eye, EyeOff, Copy, Trash2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  organization_id: string;
  scopes: string[];
  is_active: boolean;
  last_used_at?: string;
  expires_at?: string;
  created_at: string;
}

interface OAuthClient {
  id: string;
  client_id: string;
  name: string;
  organization_id: string;
  is_active: boolean;
  created_at: string;
}

const TABS = ["API Keys", "OAuth Clients"] as const;

export default function DeveloperPlatformPage() {
  const { accessToken } = useAuthStore();
  const API = process.env.NEXT_PUBLIC_API_URL;
  const [tab, setTab] = useState<typeof TABS[number]>("API Keys");
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [oauthClients, setOauthClients] = useState<OAuthClient[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchApiKeys = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/developer/api-keys?limit=100`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const d = await r.json();
      setApiKeys(d.items || d || []);
    } finally {
      setLoading(false);
    }
  };

  const fetchOAuthClients = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/developer/oauth/clients?limit=100`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const d = await r.json();
      setOauthClients(d.items || d || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "API Keys") fetchApiKeys();
    else fetchOAuthClients();
  }, [tab, accessToken]);

  const revokeKey = async (keyId: string) => {
    if (!confirm("Revoke this API key?")) return;
    try {
      const r = await fetch(`${API}/api/v1/developer/api-keys/${keyId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (r.ok) {
        toast.success("API key revoked");
        fetchApiKeys();
      }
    } catch {
      toast.error("Failed to revoke key");
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/20">
            <Code2 className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Developer Platform</h1>
            <p className="text-[11px] text-white/35">API keys, OAuth clients, and developer tools</p>
          </div>
        </div>
        <button onClick={() => tab === "API Keys" ? fetchApiKeys() : fetchOAuthClients()} className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white/40 hover:text-white">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/5 pb-0">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-[12px] font-bold transition-all border-b-2 -mb-px ${
              tab === t ? "text-cyan-400 border-cyan-400" : "text-white/30 border-transparent hover:text-white/60"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* API Keys */}
      {tab === "API Keys" && (
        <div className="rounded-2xl border border-white/5 bg-white/3 overflow-hidden">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-white/5">
            {["Key Name", "Prefix", "Status", "Last Used", ""].map((h) => (
              <div key={h} className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">{h}</div>
            ))}
          </div>
          {loading ? (
            <div className="p-8 flex items-center gap-2 text-white/25 text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : apiKeys.length === 0 ? (
            <div className="p-10 text-center text-white/20 text-sm">No API keys found</div>
          ) : (
            <div className="divide-y divide-white/3">
              {apiKeys.map((key) => (
                <div key={key.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-4 hover:bg-white/3 transition-colors group items-center">
                  <div>
                    <p className="text-[13px] font-bold text-white/70">{key.name}</p>
                    <p className="text-[10px] text-white/25 font-mono">{key.organization_id?.slice(0, 8)}…</p>
                  </div>
                  <p className="text-[12px] font-mono text-white/50">{key.key_prefix}…</p>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border w-fit ${key.is_active ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                    {key.is_active ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                    {key.is_active ? "Active" : "Revoked"}
                  </span>
                  <p className="text-[11px] text-white/30 font-mono">
                    {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : "Never"}
                  </p>
                  {key.is_active && (
                    <button
                      onClick={() => revokeKey(key.id)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* OAuth Clients */}
      {tab === "OAuth Clients" && (
        <div className="rounded-2xl border border-white/5 bg-white/3 overflow-hidden">
          <div className="grid grid-cols-[2fr_2fr_1fr_1fr] gap-4 px-5 py-3 border-b border-white/5">
            {["Client Name", "Client ID", "Status", "Created"].map((h) => (
              <div key={h} className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">{h}</div>
            ))}
          </div>
          {loading ? (
            <div className="p-8 flex items-center gap-2 text-white/25 text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : oauthClients.length === 0 ? (
            <div className="p-10 text-center text-white/20 text-sm">No OAuth clients found</div>
          ) : (
            <div className="divide-y divide-white/3">
              {oauthClients.map((client) => (
                <div key={client.id} className="grid grid-cols-[2fr_2fr_1fr_1fr] gap-4 px-5 py-4 hover:bg-white/3 transition-colors items-center">
                  <p className="text-[13px] font-bold text-white/70">{client.name}</p>
                  <p className="text-[11px] font-mono text-white/40 truncate">{client.client_id}</p>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border w-fit ${client.is_active ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-slate-500/10 text-slate-400 border-slate-500/20"}`}>
                    {client.is_active ? "Active" : "Inactive"}
                  </span>
                  <p className="text-[11px] text-white/30 font-mono">
                    {new Date(client.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
