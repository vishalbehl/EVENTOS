"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/organizer/layout/PageHeader";
import { 
  Key, Plus, Trash2, Copy, Check, ShieldAlert, 
  ExternalLink, Code, Terminal, Globe, Calendar, 
  Activity, Loader2, Sparkles, RefreshCw, Info 
} from "lucide-react";
import { apiGet, apiPost, apiDelete } from "@/lib/api-client";
import { toast } from "sonner";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

interface OAuthClient {
  id: string;
  name: string;
  client_id: string;
  redirect_uris: string[];
  is_active: boolean;
  created_at: string;
}

export default function DeveloperPage() {
  const [activeTab, setActiveTab] = useState<"keys" | "oauth">("keys");
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [oauthClients, setOauthClients] = useState<OAuthClient[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [loadingOauth, setLoadingOauth] = useState(false);

  // Key creation state
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyExpiry, setKeyExpiry] = useState("30");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);

  // OAuth client creation state
  const [isOauthModalOpen, setIsOauthModalOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [redirectUris, setRedirectUris] = useState("");
  const [generatedClient, setGeneratedClient] = useState<{
    client_id: string;
    plaintext_client_secret: string;
  } | null>(null);
  const [creatingClient, setCreatingClient] = useState(false);

  // Clipboard copies
  const [copiedText, setCopiedText] = useState<string | null>(null);

  useEffect(() => {
    fetchKeys();
    fetchOauth();
  }, []);

  const fetchKeys = async () => {
    setLoadingKeys(true);
    try {
      const data = await apiGet<ApiKey[]>("/developer/api-keys");
      setApiKeys(data);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to load API keys.");
    } finally {
      setLoadingKeys(false);
    }
  };

  const fetchOauth = async () => {
    setLoadingOauth(true);
    try {
      const data = await apiGet<OAuthClient[]>("/developer/oauth/clients");
      setOauthClients(data);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to load OAuth clients.");
    } finally {
      setLoadingOauth(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) {
      toast.error("Please enter a key name.");
      return;
    }
    setCreatingKey(true);
    try {
      const expiryDays = keyExpiry === "never" ? null : parseInt(keyExpiry);
      const res = await apiPost<{ plaintext_key: string } & ApiKey>("/developer/api-keys", {
        name: keyName,
        expires_in_days: expiryDays
      });
      setGeneratedKey(res.plaintext_key);
      toast.success("API key generated successfully!");
      fetchKeys();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate API key.");
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this API key? This action is immediate and cannot be undone.")) {
      return;
    }
    try {
      await apiDelete(`/developer/api-keys/${id}`);
      toast.success("API key revoked.");
      fetchKeys();
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke API key.");
    }
  };

  const handleRegisterOauth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      toast.error("Please enter an application name.");
      return;
    }
    if (!redirectUris.trim()) {
      toast.error("Please enter at least one redirect URI.");
      return;
    }
    setCreatingClient(true);
    try {
      const urisList = redirectUris.split(",").map(u => u.trim()).filter(Boolean);
      const res = await apiPost<{ client_id: string; plaintext_client_secret: string } & OAuthClient>("/developer/oauth/clients", {
        name: clientName,
        redirect_uris: urisList
      });
      setGeneratedClient({
        client_id: res.client_id,
        plaintext_client_secret: res.plaintext_client_secret
      });
      toast.success("OAuth application registered successfully!");
      fetchOauth();
    } catch (err: any) {
      toast.error(err.message || "Failed to register OAuth application.");
    } finally {
      setCreatingClient(false);
    }
  };

  const handleDeleteOauth = async (id: string) => {
    if (!confirm("Are you sure you want to delete this OAuth application? Any integrations using this client credentials will stop working instantly.")) {
      return;
    }
    try {
      await apiDelete(`/developer/oauth/clients/${id}`);
      toast.success("OAuth application deleted.");
      fetchOauth();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete OAuth application.");
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-20 px-4 animate-fade-in text-[var(--text)]">
      {/* Page Header */}
      <PageHeader 
        title="Developer Console" 
        description="Integrate your custom applications, webhooks, and automate event management with full-access API Keys and OAuth2 Gateway clients."
      />

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="relative group overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md transition-all hover:border-violet-500/30">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-violet-600/10 blur-xl group-hover:bg-violet-600/20 transition-all duration-300"></div>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-violet-600/10 border border-violet-500/20 text-violet-400">
              <Key className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Active API Keys</p>
              <h3 className="text-2xl font-black mt-1">{loadingKeys ? <Loader2 className="h-5 w-5 animate-spin text-violet-400" /> : apiKeys.length}</h3>
            </div>
          </div>
        </div>

        <div className="relative group overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md transition-all hover:border-blue-500/30">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-blue-600/10 blur-xl group-hover:bg-blue-600/20 transition-all duration-300"></div>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400">
              <Globe className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">OAuth Applications</p>
              <h3 className="text-2xl font-black mt-1">{loadingOauth ? <Loader2 className="h-5 w-5 animate-spin text-blue-400" /> : oauthClients.length}</h3>
            </div>
          </div>
        </div>

        <div className="relative group overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md transition-all hover:border-emerald-500/30">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-600/10 blur-xl group-hover:bg-emerald-600/20 transition-all duration-300"></div>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-600/10 border border-emerald-500/20 text-emerald-400">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Gateway Status</p>
              <h3 className="text-lg font-black mt-1 text-emerald-400 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
                Operational
              </h3>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-white/10 gap-6">
        <button
          onClick={() => setActiveTab("keys")}
          className={`pb-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "keys" 
              ? "border-violet-500 text-violet-400 font-extrabold" 
              : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          <Key className="h-4 w-4" />
          API Keys
        </button>
        <button
          onClick={() => setActiveTab("oauth")}
          className={`pb-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "oauth" 
              ? "border-blue-500 text-blue-400 font-extrabold" 
              : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          <Globe className="h-4 w-4" />
          OAuth Applications
        </button>
      </div>

      {/* API Keys Panel */}
      {activeTab === "keys" && (
        <div className="space-y-6">
          {/* Action Header */}
          <div className="flex justify-between items-center">
            <div>
              <h4 className="text-lg font-black">Generate API Keys</h4>
              <p className="text-xs text-[var(--muted)]">API Keys are suitable for server-to-server calls and integration jobs.</p>
            </div>
            <button
              onClick={() => {
                setGeneratedKey(null);
                setKeyName("");
                setIsKeyModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 transition-all flex items-center gap-2 shadow-lg shadow-violet-500/20"
            >
              <Plus className="h-4 w-4" />
              Generate API Key
            </button>
          </div>

          {/* Table Container */}
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
            {loadingKeys ? (
              <div className="p-20 flex justify-center items-center">
                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
              </div>
            ) : apiKeys.length === 0 ? (
              <div className="p-20 text-center space-y-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/10 text-[var(--muted)]">
                  <Key className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold">No API keys registered yet.</p>
                  <p className="text-xs text-[var(--muted)] mt-1">Create a key to authenticate your service requests.</p>
                </div>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
                    <th className="p-4">Name</th>
                    <th className="p-4">Token Prefix</th>
                    <th className="p-4">Created</th>
                    <th className="p-4">Expires</th>
                    <th className="p-4">Last Used</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm font-medium">
                  {apiKeys.map((key) => (
                    <tr key={key.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-4 font-bold">{key.name}</td>
                      <td className="p-4">
                        <code className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-mono text-violet-300">
                          {key.prefix}...
                        </code>
                      </td>
                      <td className="p-4 text-xs text-[var(--muted)]">{formatDate(key.created_at)}</td>
                      <td className="p-4 text-xs text-[var(--muted)]">{formatDate(key.expires_at)}</td>
                      <td className="p-4 text-xs text-[var(--muted)]">{formatDate(key.last_used_at)}</td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleRevokeKey(key.id)}
                          className="p-2 rounded-lg hover:bg-rose-500/10 text-rose-400 transition-colors"
                          title="Revoke key"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* OAuth Applications Panel */}
      {activeTab === "oauth" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h4 className="text-lg font-black">OAuth2 Client Registrations</h4>
              <p className="text-xs text-[var(--muted)]">Configure OAuth client applications to run code on behalf of event organizers.</p>
            </div>
            <button
              onClick={() => {
                setGeneratedClient(null);
                setClientName("");
                setRedirectUris("");
                setIsOauthModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20"
            >
              <Plus className="h-4 w-4" />
              Register Application
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
            {loadingOauth ? (
              <div className="p-20 flex justify-center items-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              </div>
            ) : oauthClients.length === 0 ? (
              <div className="p-20 text-center space-y-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/10 text-[var(--muted)]">
                  <Globe className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold">No OAuth applications registered yet.</p>
                  <p className="text-xs text-[var(--muted)] mt-1">Register an application to access user authorized scopes.</p>
                </div>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
                    <th className="p-4">Application Name</th>
                    <th className="p-4">Client ID</th>
                    <th className="p-4">Redirect URIs</th>
                    <th className="p-4">Created</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm font-medium">
                  {oauthClients.map((client) => (
                    <tr key={client.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-4 font-bold">{client.name}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <code className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-mono text-blue-300">
                            {client.client_id}
                          </code>
                          <button
                            onClick={() => handleCopy(client.client_id, `cid-${client.id}`)}
                            className="p-1 hover:bg-white/10 rounded text-[var(--muted)] hover:text-white transition-all"
                            title="Copy Client ID"
                          >
                            {copiedText === `cid-${client.id}` ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      </td>
                      <td className="p-4 max-w-xs truncate text-xs text-[var(--muted)]">
                        {client.redirect_uris.join(", ")}
                      </td>
                      <td className="p-4 text-xs text-[var(--muted)]">{formatDate(client.created_at)}</td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleDeleteOauth(client.id)}
                          className="p-2 rounded-lg hover:bg-rose-500/10 text-rose-400 transition-colors"
                          title="Delete client"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Key Generation Modal */}
      {isKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[var(--surf)] p-6 shadow-2xl relative">
            <h3 className="text-lg font-black mb-4 flex items-center gap-2">
              <Key className="text-violet-400" />
              Generate API Key
            </h3>

            {!generatedKey ? (
              <form onSubmit={handleGenerateKey} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Key Name</label>
                  <input
                    type="text"
                    required
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    placeholder="e.g. Analytics Pipeline"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-violet-500 transition-all font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Expiration</label>
                  <select
                    value={keyExpiry}
                    onChange={(e) => setKeyExpiry(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-violet-500 transition-all font-medium text-[var(--text)] [&>option]:bg-[var(--surf)]"
                  >
                    <option value="7">7 Days</option>
                    <option value="30">30 Days</option>
                    <option value="90">90 Days</option>
                    <option value="never">Never Expire</option>
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setIsKeyModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold hover:bg-white/5 transition-all text-[var(--muted)] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingKey}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white transition-all shadow-lg flex items-center gap-2"
                  >
                    {creatingKey && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Create Key
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-5">
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 flex gap-3 text-xs text-rose-300 font-bold">
                  <ShieldAlert className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="uppercase tracking-wider">Save this key now</p>
                    <p className="font-medium mt-0.5 text-rose-200/80">For security reasons, this key will only be shown once. If you close this window, you cannot retrieve it.</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Plaintext API Key</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 select-all p-3 rounded-xl border border-white/10 bg-white/5 font-mono text-xs text-violet-300 break-all select-none">
                      {generatedKey}
                    </code>
                    <button
                      onClick={() => handleCopy(generatedKey, "new-key")}
                      className="p-3 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl transition-all"
                      title="Copy Key"
                    >
                      {copiedText === "new-key" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4 text-violet-400" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-white/5">
                  <button
                    onClick={() => {
                      setIsKeyModalOpen(false);
                      setGeneratedKey(null);
                    }}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all"
                  >
                    I have saved it
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* OAuth Application Modal */}
      {isOauthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[var(--surf)] p-6 shadow-2xl relative">
            <h3 className="text-lg font-black mb-4 flex items-center gap-2">
              <Globe className="text-blue-400" />
              Register OAuth Application
            </h3>

            {!generatedClient ? (
              <form onSubmit={handleRegisterOauth} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Application Name</label>
                  <input
                    type="text"
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g. Mobile Check-in App"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-blue-500 transition-all font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Redirect URIs</label>
                  <textarea
                    required
                    value={redirectUris}
                    onChange={(e) => setRedirectUris(e.target.value)}
                    placeholder="e.g. https://myapp.com/oauth/callback (comma separated)"
                    rows={3}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-blue-500 transition-all font-medium"
                  />
                  <p className="text-[10px] text-[var(--muted)]">Authorized redirect target URLs for exchange codes.</p>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setIsOauthModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold hover:bg-white/5 transition-all text-[var(--muted)] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingClient}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-lg flex items-center gap-2"
                  >
                    {creatingClient && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Register Client
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-5">
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 flex gap-3 text-xs text-rose-300 font-bold">
                  <ShieldAlert className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="uppercase tracking-wider">Save Client Credentials Now</p>
                    <p className="font-medium mt-0.5 text-rose-200/80">The Client Secret will never be shown again. Please save it securely.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Client ID</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-3 rounded-xl border border-white/10 bg-white/5 font-mono text-xs text-blue-300 truncate">
                        {generatedClient.client_id}
                      </code>
                      <button
                        onClick={() => handleCopy(generatedClient.client_id, "new-cid")}
                        className="p-3 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl transition-all"
                        title="Copy Client ID"
                      >
                        {copiedText === "new-cid" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4 text-blue-400" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Client Secret</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-3 rounded-xl border border-white/10 bg-white/5 font-mono text-xs text-blue-300 break-all select-none">
                        {generatedClient.plaintext_client_secret}
                      </code>
                      <button
                        onClick={() => handleCopy(generatedClient.plaintext_client_secret, "new-secret")}
                        className="p-3 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl transition-all"
                        title="Copy Secret"
                      >
                        {copiedText === "new-secret" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4 text-blue-400" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-white/5">
                  <button
                    onClick={() => {
                      setIsOauthModalOpen(false);
                      setGeneratedClient(null);
                    }}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all"
                  >
                    I have saved them
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
