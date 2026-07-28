"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
   User, Bell, Shield, AppWindow, Key, CreditCard,
   Settings, Save, Globe, Smartphone, Mail, Lock,
   Fingerprint, Zap, Code, ExternalLink, ChevronRight,
   Monitor, Palette, Trash2, CheckCircle2, Box, Info, Plus, Layers,
   Users, Building2, Receipt, FileText, BarChart3, Phone, Camera,
   Loader2
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useFloatingToolbarStore } from "@/store/useFloatingToolbarStore";
import { useAuthStore } from "@/store/use-auth-store";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { countries, timezones, slugify } from "@/components/organizer/org/org-api";
import { apiClient } from "@/lib/api-client";
import { useOrganizationOperationAccess } from "@/lib/capabilities";

type DeveloperApiKey = {
   id: string;
   name: string;
   prefix: string;
   is_active: boolean;
   expires_at?: string | null;
   last_used_at?: string | null;
   created_at: string;
};

type CreatedDeveloperApiKey = DeveloperApiKey & { plaintext_key: string };

const DEFAULT_AVATARS = [
   "https://api.dicebear.com/7.x/lorelei/svg?seed=Felix",
   "https://api.dicebear.com/7.x/lorelei/svg?seed=Aria",
   "https://api.dicebear.com/7.x/lorelei/svg?seed=Jack",
   "https://api.dicebear.com/7.x/lorelei/svg?seed=Milo",
   "https://api.dicebear.com/7.x/lorelei/svg?seed=Luna",
];

function SettingsPageContent() {
   const { eventId } = useParams();
   const searchParams = useSearchParams();
   const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "profile");
   const { user, updateUser } = useAuthStore();
   const setToolbarActions = useFloatingToolbarStore((state) => state.setActions);
   const [hasHydrated, setHasHydrated] = useState(false);

   useEffect(() => {
      setHasHydrated(true);
   }, []);

   const [isSaving, setIsSaving] = useState(false);
   const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);
   const [expandedApiKeyId, setExpandedApiKeyId] = useState<string | null>(null);
   const developerAccess = useOrganizationOperationAccess("developer.api.use");
   const webhookAccess = useOrganizationOperationAccess("developer.webhooks.manage");
   const integrationAccess = useOrganizationOperationAccess("integrations.manage");
   const [apiKeys, setApiKeys] = useState<DeveloperApiKey[]>([]);
   const [apiKeysLoading, setApiKeysLoading] = useState(false);
   const [newApiKeyName, setNewApiKeyName] = useState("");
   const [createdApiKey, setCreatedApiKey] = useState<CreatedDeveloperApiKey | null>(null);

   const loadApiKeys = async () => {
      if (!developerAccess.enabled) {
         setApiKeys([]);
         return;
      }
      setApiKeysLoading(true);
      try {
         setApiKeys(await apiClient.get<DeveloperApiKey[]>("/developer/api-keys"));
      } catch (error: any) {
         toast.error(error.message || "Developer keys are unavailable.");
      } finally {
         setApiKeysLoading(false);
      }
   };

   const createApiKey = async () => {
      const name = newApiKeyName.trim();
      if (!developerAccess.enabled || name.length < 2) return;
      setApiKeysLoading(true);
      try {
         const created = await apiClient.post<CreatedDeveloperApiKey>(
            "/developer/api-keys",
            { name },
            { headers: { "Idempotency-Key": crypto.randomUUID() } },
         );
         setCreatedApiKey(created);
         setNewApiKeyName("");
         await loadApiKeys();
         toast.success("API key created. Copy the secret now; it will not be shown again.");
      } catch (error: any) {
         toast.error(error.message || "Failed to create API key.");
      } finally {
         setApiKeysLoading(false);
      }
   };

   const revokeApiKey = async (keyId: string) => {
      if (!developerAccess.enabled) return;
      try {
         await apiClient.delete(`/developer/api-keys/${keyId}`, {
            headers: { "Idempotency-Key": crypto.randomUUID() },
         });
         await loadApiKeys();
         toast.success("API key revoked.");
      } catch (error: any) {
         toast.error(error.message || "Failed to revoke API key.");
      }
   };

   useEffect(() => {
      if (activeTab === "api" && !developerAccess.loading) void loadApiKeys();
   }, [activeTab, developerAccess.enabled]);

   const [systemTimezone, setSystemTimezone] = useState("Asia/Kolkata");
   const [isSavingSystem, setIsSavingSystem] = useState(false);

   useEffect(() => {
      if (activeTab === "system") {
         const fetchTz = async () => {
            try {
               const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/global-settings`, {
                  headers: {
                     'Authorization': `Bearer ${useAuthStore.getState().accessToken}`
                  }
               });
               if (response.ok) {
                  const data = await response.json();
                  if (data && data.timezone) {
                     setSystemTimezone(data.timezone);
                  }
               }
            } catch (err) {
               console.error("Failed to load global timezone:", err);
            }
         };
         fetchTz();
      }
   }, [activeTab]);

   const handleSaveSystemSettings = async () => {
      setIsSavingSystem(true);
      try {
         const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/global-settings`, {
            method: 'PATCH',
            headers: {
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${useAuthStore.getState().accessToken}`
            },
            body: JSON.stringify({ timezone: systemTimezone })
         });

         if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || "Failed to update global settings");
         }

         const data = await response.json();
         localStorage.setItem("system-timezone", data.timezone);
         window.dispatchEvent(new Event("system-timezone-changed"));
         toast.success("System configurations updated successfully");
      } catch (error: any) {
         toast.error(error.message);
      } finally {
         setIsSavingSystem(false);
      }
   };

   const [formData, setFormData] = useState({
      first_name: user?.first_name || "",
      last_name: user?.last_name || "",
      email: user?.email || "",
      phone: user?.phone || "",
      avatar_url: user?.avatar_url || "",
   });

   useEffect(() => {
      if (user) {
         setFormData({
            first_name: user.first_name || "",
            last_name: user.last_name || "",
            email: user.email || "",
            phone: user.phone || "",
            avatar_url: user.avatar_url || "",
         });
      }
   }, [user]);

   const handleSaveProfile = async () => {
      setIsSaving(true);
      try {
         const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/me`, {
            method: 'PATCH',
            headers: {
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${useAuthStore.getState().accessToken}`
            },
            body: JSON.stringify(formData)
         });

         if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || "Failed to update profile");
         }

         const updatedUser = await response.json();
         updateUser(updatedUser);
         toast.success("Profile updated successfully");
      } catch (error: any) {
         toast.error(error.message);
      } finally {
         setIsSaving(false);
      }
   };

   // New Organisation Details states & handlers
   const [orgData, setOrgData] = useState({
      name: "",
      slug: "",
      country: "IN",
      timezone: "Asia/Kolkata",
   });
   const [currentOrgSlug, setCurrentOrgSlug] = useState("");
   const [isSavingOrg, setIsSavingOrg] = useState(false);
   const [orgSlugAvailable, setOrgSlugAvailable] = useState<boolean | null>(null);
   const [checkingOrgSlug, setCheckingOrgSlug] = useState(false);

   useEffect(() => {
      const fetchOrg = async () => {
         try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/organisations/me`, {
               headers: {
                  'Authorization': `Bearer ${useAuthStore.getState().accessToken}`
               }
            });
            if (response.ok) {
               const data = await response.json();
               if (data && data.organization) {
                  setOrgData({
                     name: data.organization.name || "",
                     slug: data.organization.slug || "",
                     country: data.organization.country || "IN",
                     timezone: data.organization.timezone || "Asia/Kolkata",
                  });
                  setCurrentOrgSlug(data.organization.slug || "");
               }
            }
         } catch (err) {
            console.error("Failed to load organization profile:", err);
         }
      };
      if (useAuthStore.getState().isAuthenticated) {
         fetchOrg();
      }
   }, [activeTab]);

   useEffect(() => {
      if (!orgData.slug || orgData.slug.length < 3 || orgData.slug === currentOrgSlug) {
         setOrgSlugAvailable(true);
         return;
      }
      const timer = setTimeout(async () => {
         setCheckingOrgSlug(true);
         try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/organisations/check-slug?slug=${orgData.slug}`, {
               headers: { 'Authorization': `Bearer ${useAuthStore.getState().accessToken}` }
            });
            if (res.ok) {
               const check = await res.json();
               setOrgSlugAvailable(check.available);
            } else {
               setOrgSlugAvailable(false);
            }
         } catch {
            setOrgSlugAvailable(false);
         } finally {
            setCheckingOrgSlug(false);
         }
      }, 500);
      return () => clearTimeout(timer);
   }, [orgData.slug, currentOrgSlug]);

   const handleSaveOrg = async () => {
      if (!orgData.name || !orgData.slug) {
         toast.error("Organisation name and slug are required");
         return;
      }
      if (orgSlugAvailable === false) {
         toast.error("Organisation slug is already taken");
         return;
      }
      setIsSavingOrg(true);
      try {
         const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/organisations/me`, {
            method: 'PUT',
            headers: {
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${useAuthStore.getState().accessToken}`
            },
            body: JSON.stringify(orgData)
         });

         if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || "Failed to update organisation");
         }

         const data = await response.json();
         setCurrentOrgSlug(data.organization.slug || "");
         toast.success("Organisation settings updated successfully");
      } catch (error: any) {
         toast.error(error.message);
      } finally {
         setIsSavingOrg(false);
      }
   };

   const [passwordData, setPasswordData] = useState({ current: "", new: "" });
   const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

   const handleUpdatePassword = async () => {
      if (!passwordData.current || !passwordData.new) {
         toast.error("Please fill in both password fields");
         return;
      }
      setIsUpdatingPassword(true);
      try {
         const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/change-password`, {
            method: 'POST',
            headers: {
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${useAuthStore.getState().accessToken}`
            },
            body: JSON.stringify({
               current_password: passwordData.current,
               new_password: passwordData.new,
            })
         });

         if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || "Failed to update password");
         }

         toast.success("Password updated successfully. Please log in again.");
         setPasswordData({ current: "", new: "" });
         setTimeout(() => useAuthStore.getState().logout(), 2000);
      } catch (error: any) {
         toast.error(error.message);
      } finally {
         setIsUpdatingPassword(false);
      }
   };

   useEffect(() => {
      if (activeTab === "profile") {
         setToolbarActions([
            { label: "Save Profile", icon: Save, onClick: handleSaveProfile, color: "bg-[var(--pri)]/10" },
         ]);
      } else if (activeTab === "organisation") {
         setToolbarActions([
            { label: "Save Organisation", icon: Save, onClick: handleSaveOrg, color: "bg-[var(--pri)]/10" },
         ]);
      } else {
         setToolbarActions([]);
      }
   }, [setToolbarActions, activeTab, formData, orgData, orgSlugAvailable]);

   const baseTabs = [
      { id: "profile", label: "My Profile", icon: User },
      { id: "organisation", label: "Organisation", icon: Building2 },
      { id: "security", label: "Security & Access", icon: Shield },
      { id: "notifications", label: "Notifications", icon: Bell },
      { id: "api", label: "Developer Keys", icon: Key },
   ];

   const isSuperAdmin = user?.role?.toLowerCase().replace(/[\s_]/g, '') === 'superadmin';

   const adminTabs = isSuperAdmin ? [
      { id: "orgs", label: "Organizations", icon: Building2 },
      { id: "system", label: "System Settings", icon: Globe },
   ] : [];

   const tabs = [...baseTabs, ...adminTabs];

   if (!hasHydrated || (useAuthStore.getState().isAuthenticated && !user)) {
      return (
         <div className="h-[70vh] flex flex-col items-center justify-center space-y-6">
            <div className="h-16 w-16 border-4 border-[var(--pri)] border-t-transparent rounded-full animate-spin shadow-[0_0_20px_var(--pri)]" />
            <p className="text-[10px] font-black text-muted uppercase tracking-[0.4em] animate-pulse">Syncing Account...</p>
         </div>
      );
   }

   return (
      <div className="space-y-10 max-w-[1400px] mx-auto pb-20 animate-fade-in perspective-1000">
         <header className="flex flex-col md:flex-row items-center justify-between gap-6 px-2">
            <div>
               <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] mb-2">
                  {user?.role === 'super_admin' ? 'Administrative' : 'Account'} <span className="text-[var(--sec)]">Settings</span>
               </h1>
               <p className="text-[13px] font-bold text-muted uppercase tracking-[0.3em]">
                  {user?.role === 'super_admin' ? 'Root Access Enabled' : 'Manage your profile and security'}
               </p>
            </div>
            <Button
               onClick={activeTab === "organisation" ? handleSaveOrg : handleSaveProfile}
               disabled={activeTab === "organisation" ? isSavingOrg : isSaving}
               className="h-12 px-10 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full shadow-lg border-0 transition-all"
            >
               {(activeTab === "organisation" ? isSavingOrg : isSaving) ? (
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
               ) : (
                  <Save className="mr-2 h-4 w-4" />
               )}
               Save Changes
            </Button>
         </header>

         <div className="grid gap-10 lg:grid-cols-[300px_1fr]">

            <aside className="space-y-4">
               <div className="glass-3d p-4 rounded-[2.5rem] border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] flex flex-col gap-1.5 shadow-xl">
                  {tabs.map((tab) => (
                     <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                           "relative flex items-center gap-4 px-6 py-4 rounded-2xl text-[12px] font-bold tracking-tight transition-all duration-300 group",
                           activeTab === tab.id ? "text-[var(--text)]" : "text-muted hover:text-[var(--text)]"
                        )}
                     >
                        {activeTab === tab.id && (
                           <motion.div
                              layoutId="settings-active"
                              className="absolute inset-0 bg-[var(--pri)] rounded-2xl z-[-1] shadow-lg shadow-[var(--pri)]/20"
                           />
                        )}
                        <tab.icon className="h-5 w-5 shrink-0" />
                        <span className="truncate">{tab.label}</span>
                     </button>
                  ))}
               </div>
            </aside>

            <Card className="glass-3d border-default rounded-[3.5rem] p-12 min-h-[700px] relative overflow-hidden flex flex-col shadow-2xl">
               <AnimatePresence mode="wait">
                  {activeTab === "profile" && (
                     <motion.div
                        key="profile"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-12 relative z-10"
                     >
                        <div className="flex items-center gap-10">
                           <div className="relative group">
                              <input 
                                 type="file"
                                 id="avatar-upload"
                                 className="hidden"
                                 accept="image/png, image/jpeg, image/jpg"
                                 onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                       const reader = new FileReader();
                                       reader.onloadend = () => {
                                          setFormData({ ...formData, avatar_url: reader.result as string });
                                       };
                                       reader.readAsDataURL(file);
                                    }
                                 }}
                              />
                              <div className="relative h-32 w-32 glass-3d rounded-[2.5rem] border-default flex items-center justify-center overflow-hidden shadow-2xl">
                                 {formData.avatar_url ? (
                                    <img src={formData.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                                 ) : (
                                    <img 
                                       src={`https://api.dicebear.com/7.x/lorelei/svg?seed=${user?.email || 'default'}`} 
                                       alt="Avatar" 
                                       className="h-full w-full object-cover" 
                                    />
                                 )}
                              </div>
                              <label 
                                 htmlFor="avatar-upload"
                                 className="absolute -bottom-2 -right-2 h-10 w-10 bg-[var(--pri)] rounded-xl flex items-center justify-center text-white shadow-lg cursor-pointer hover:scale-110 transition-transform z-20"
                              >
                                 <Camera className="h-5 w-5" />
                              </label>
                           </div>

                           <div className="space-y-4">
                              <p className="text-[10px] font-black text-muted uppercase tracking-widest px-1">Choose Default Avatar</p>
                              <div className="flex gap-3">
                                 {DEFAULT_AVATARS.map((url, i) => (
                                    <button
                                       key={i}
                                       onClick={() => setFormData({ ...formData, avatar_url: url })}
                                       className={cn(
                                          "h-12 w-12 rounded-xl border-2 transition-all overflow-hidden",
                                          formData.avatar_url === url ? "border-[var(--pri)] scale-110" : "border-transparent opacity-60 hover:opacity-100"
                                       )}
                                    >
                                       <img src={url} alt="Avatar" className="h-full w-full object-cover" />
                                    </button>
                                 ))}
                                 <button
                                    onClick={() => setFormData({ ...formData, avatar_url: "" })}
                                    className="h-12 w-12 rounded-xl border-2 border-dashed border-default flex items-center justify-center text-muted hover:text-[var(--text)] hover:border-[var(--text)] transition-all"
                                 >
                                    <Trash2 className="h-5 w-5" />
                                 </button>
                              </div>
                           </div>
                        </div>

                        <div className="grid grid-cols-2 gap-8 pt-8 border-t border-default">
                           <div className="space-y-3">
                              <label className="text-[10px] font-black text-muted uppercase tracking-widest px-1">First Name</label>
                              <Input
                                 value={formData.first_name}
                                 onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                                 className="h-14 bg-[var(--base)]/50 border-default rounded-2xl px-5 font-bold"
                              />
                           </div>
                           <div className="space-y-3">
                              <label className="text-[10px] font-black text-muted uppercase tracking-widest px-1">Last Name</label>
                              <Input
                                 value={formData.last_name}
                                 onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                                 className="h-14 bg-[var(--base)]/50 border-default rounded-2xl px-5 font-bold"
                              />
                           </div>
                           <div className="space-y-3">
                              <label className="text-[10px] font-black text-muted uppercase tracking-widest px-1">Email Address</label>
                              <Input
                                 value={formData.email}
                                 disabled={true}
                                 onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                 className="h-14 bg-[var(--base)]/50 border-default rounded-2xl px-5 font-bold opacity-60 cursor-not-allowed"
                              />
                           </div>
                           <div className="space-y-3">
                              <label className="text-[10px] font-black text-muted uppercase tracking-widest px-1">Phone Number</label>
                              <div className="relative">
                                 <Phone className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                                 <Input
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    placeholder="+1 (555) 000-0000"
                                    className="h-14 bg-[var(--base)]/50 border-default rounded-2xl pl-12 pr-5 font-bold"
                                 />
                              </div>
                           </div>
                        </div>

                        <div className="pt-8 border-t border-default">
                           <h4 className="text-[11px] font-black text-muted uppercase tracking-widest mb-6 px-1">Change Security Key</h4>
                           <div className="grid grid-cols-2 gap-8">
                              <div className="space-y-3">
                                 <label className="text-[10px] font-black text-muted uppercase tracking-widest px-1">Current Key</label>
                                 <Input
                                    type="password"
                                    value={passwordData.current}
                                    onChange={(e) => setPasswordData({ ...passwordData, current: e.target.value })}
                                    className="h-14 bg-[var(--base)]/50 border-default rounded-2xl px-5 font-bold"
                                 />
                              </div>
                              <div className="space-y-3">
                                 <label className="text-[10px] font-black text-muted uppercase tracking-widest px-1">New Key</label>
                                 <Input
                                    type="password"
                                    value={passwordData.new}
                                    onChange={(e) => setPasswordData({ ...passwordData, new: e.target.value })}
                                    className="h-14 bg-[var(--base)]/50 border-default rounded-2xl px-5 font-bold"
                                 />
                              </div>
                           </div>
                           <Button
                              onClick={handleUpdatePassword}
                              disabled={isUpdatingPassword}
                              className="mt-8 h-12 px-10 bg-[var(--pri)]/10 text-[var(--pri)] hover:bg-[var(--pri)] hover:text-white font-black uppercase tracking-widest text-[10px] rounded-xl transition-all"
                           >
                              {isUpdatingPassword ? "Processing..." : "Update Security Key"}
                           </Button>
                        </div>
                     </motion.div>
                  )}

                  {activeTab === "organisation" && (
                     <motion.div
                        key="organisation"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-12 relative z-10"
                     >
                        <div>
                           <h3 className="text-xl font-black text-[var(--text)] mb-2">Organisation Settings</h3>
                           <p className="text-[13px] text-muted font-medium tracking-tight">Configure details and regional preferences for your organisation workspace.</p>
                        </div>

                        <div className="grid grid-cols-1 gap-8 pt-8 border-t border-default">
                           <div className="grid grid-cols-2 gap-8">
                              <div className="space-y-3">
                                 <label className="text-[10px] font-black text-muted uppercase tracking-widest px-1">Organisation Name</label>
                                 <Input
                                    value={orgData.name}
                                    onChange={(e) => setOrgData({ ...orgData, name: e.target.value })}
                                    className="h-14 bg-[var(--base)]/50 border-default rounded-2xl px-5 font-bold"
                                 />
                              </div>
                              <div className="space-y-3">
                                 <label className="text-[10px] font-black text-muted uppercase tracking-widest px-1">Organisation Slug</label>
                                 <div className="relative">
                                    <Input
                                       value={orgData.slug}
                                       onChange={(e) => setOrgData({ ...orgData, slug: slugify(e.target.value) })}
                                       className="h-14 bg-[var(--base)]/50 border-default pl-5 pr-12 font-bold"
                                    />
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                       {checkingOrgSlug ? (
                                          <Loader2 className="h-4 w-4 animate-spin text-muted" />
                                       ) : orgSlugAvailable === true ? (
                                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                       ) : orgSlugAvailable === false ? (
                                          <span className="text-[10px] font-black text-[var(--dan)] uppercase">Taken</span>
                                       ) : null}
                                    </div>
                                 </div>
                                 <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1 px-1">
                                    Workspace URL: Event.in/{orgData.slug || "your-slug"}
                                 </p>
                              </div>
                           </div>

                           <div className="grid grid-cols-2 gap-8">
                              <div className="space-y-3">
                                 <label className="text-[10px] font-black text-muted uppercase tracking-widest px-1">Country</label>
                                 <Select value={orgData.country} onValueChange={(country) => setOrgData({ ...orgData, country })}>
                                    <SelectTrigger className="h-14 bg-[var(--base)]/50 border-default rounded-2xl px-5 font-bold text-white"><SelectValue /></SelectTrigger>
                                    <SelectContent>{countries.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                                 </Select>
                              </div>
                              <div className="space-y-3">
                                 <label className="text-[10px] font-black text-muted uppercase tracking-widest px-1">Timezone</label>
                                 <Select value={orgData.timezone} onValueChange={(timezone) => setOrgData({ ...orgData, timezone })}>
                                    <SelectTrigger className="h-14 bg-[var(--base)]/50 border-default rounded-2xl px-5 font-bold text-white"><SelectValue /></SelectTrigger>
                                    <SelectContent>{timezones.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent>
                                 </Select>
                              </div>
                           </div>
                        </div>

                        <div className="pt-8 border-t border-default flex justify-end">
                           <Button
                              onClick={handleSaveOrg}
                              disabled={isSavingOrg}
                              className="h-12 px-10 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-xl shadow-lg transition-all"
                           >
                              {isSavingOrg ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="mr-2 h-4 w-4" />}
                              Save Organisation Details
                           </Button>
                        </div>
                     </motion.div>
                  )}


                  {activeTab === "security" && (
                     <motion.div
                        key="security"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-12 relative z-10"
                     >
                        <div>
                           <h3 className="text-xl font-black text-[var(--text)] mb-2">Security Perimeter</h3>
                           <p className="text-[13px] text-muted font-medium tracking-tight">Protect your account with multi-layered encryption and IP restrictions.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-10">
                           <div className="p-10 rounded-[3rem] glass-3d border-default bg-[var(--pri)]/5 space-y-8 flex flex-col items-center text-center">
                              <Fingerprint className="h-12 w-12 text-[var(--pri)] animate-pulse" />
                              <div>
                                 <h4 className="text-[15px] font-black text-[var(--text)] uppercase tracking-widest mb-2">Two-Factor Auth</h4>
                                 <p className="text-[11px] text-muted font-medium leading-relaxed px-4">Enable 2FA to add an extra layer of security to your account.</p>
                              </div>
                              <Button
                                 onClick={async () => {
                                    try {
                                       const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/me/toggle-2fa`, {
                                          method: 'POST',
                                          headers: { 'Authorization': `Bearer ${useAuthStore.getState().accessToken}` }
                                       });
                                       const updatedUser = await response.json();
                                       updateUser(updatedUser);
                                       toast.success(`2FA ${updatedUser.is_2fa_enabled ? 'enabled' : 'disabled'}`);
                                    } catch (error) {
                                       toast.error("Failed to toggle 2FA");
                                    }
                                 }}
                                 className="h-12 px-8 bg-[var(--pri)] text-white font-black uppercase tracking-widest text-[10px] rounded-xl border-0"
                              >
                                 {user?.is_2fa_enabled ? "Disable 2FA" : "Enable 2FA"}
                              </Button>
                           </div>

                           <div className="space-y-4">
                              <h4 className="text-[11px] font-black text-muted uppercase tracking-widest px-1">Access Options</h4>
                              {[
                                 { label: "Audit Logging", desc: "Record every action taken", active: true },
                                 { label: "Device Trust", desc: "Remember this browser", active: true },
                              ].map((mod, i) => (
                                 <div key={i} className="p-6 rounded-3xl glass-3d border-default flex items-center justify-between group hover:bg-white/5 transition-all">
                                    <div>
                                       <p className="text-[13px] font-bold text-[var(--text)]">{mod.label}</p>
                                       <p className="text-[10px] font-black text-muted uppercase tracking-widest mt-0.5">{mod.desc}</p>
                                    </div>
                                    <div className={cn("h-6 w-12 rounded-full p-1", mod.active ? "bg-[var(--pri)]" : "bg-default")}>
                                       <div className={cn("h-4 w-4 bg-white rounded-full transition-all", mod.active ? "ml-6" : "ml-0")} />
                                    </div>
                                 </div>
                              ))}
                           </div>
                        </div>
                     </motion.div>
                  )}

                  {activeTab === "notifications" && (
                     <motion.div
                        key="notifications"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-10"
                     >
                        <h3 className="text-xl font-black text-[var(--text)] mb-2">Notification Preferences</h3>
                        <div className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-6">
                           <p className="text-sm font-semibold text-amber-200">Preference service unavailable</p>
                           <p className="mt-2 text-sm text-muted">
                              No user-scoped notification preference API is registered. Controls remain unavailable instead of displaying sample values that are not persisted.
                           </p>
                        </div>
                     </motion.div>
                  )}

                  {activeTab === "api" && (
                     <motion.div
                        key="api"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-10"
                     >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                           <div>
                              <h3 className="text-xl font-black text-[var(--text)] mb-2">Developer Access</h3>
                              <p className="text-[13px] text-muted font-medium">Manage API keys and developer integration endpoints.</p>
                           </div>
                           <div className="flex gap-2">
                              <Input
                                 value={newApiKeyName}
                                 onChange={(event) => setNewApiKeyName(event.target.value)}
                                 placeholder="Key name"
                                 disabled={!developerAccess.enabled || apiKeysLoading}
                                 className="h-10 w-56"
                              />
                              <Button onClick={() => void createApiKey()} disabled={!developerAccess.enabled || apiKeysLoading || newApiKeyName.trim().length < 2} className="h-10 bg-[var(--pri)] text-white rounded-xl text-[10px] font-black uppercase tracking-widest px-6">
                                 <Plus className="mr-2 h-4 w-4" /> Create API Key
                              </Button>
                           </div>
                        </div>

                        {!developerAccess.loading && !developerAccess.enabled && (
                           <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-6">
                              <p className="font-semibold text-amber-200">Developer access is locked</p>
                              <p className="mt-2 text-sm text-muted">
                                 {(developerAccess.reason || "NOT_ENTITLED").replaceAll("_", " ")}. Request FEAT_API_ACCESS through the subscription workspace; this portal cannot grant itself access.
                              </p>
                           </div>
                        )}

                        <div className="grid gap-4 md:grid-cols-2">
                           <div className="rounded-2xl border border-default bg-white/[0.02] p-5">
                              <div className="flex items-center justify-between gap-4">
                                 <div><p className="font-semibold text-[var(--text)]">Event webhooks</p><p className="mt-1 text-xs text-muted">Webhook endpoints are scoped to an event and enforced by the canonical webhook entitlement.</p></div>
                                 <Badge variant="outline">{webhookAccess.loading ? "CHECKING" : webhookAccess.enabled ? "ALLOWED" : "LOCKED"}</Badge>
                              </div>
                              {!webhookAccess.loading && !webhookAccess.enabled && <p className="mt-3 text-xs text-amber-200">{(webhookAccess.reason || "RESOLUTION_UNAVAILABLE").replaceAll("_", " ")}</p>}
                           </div>
                           <div className="rounded-2xl border border-default bg-white/[0.02] p-5">
                              <div className="flex items-center justify-between gap-4">
                                 <div><p className="font-semibold text-[var(--text)]">Third-party integrations</p><p className="mt-1 text-xs text-muted">Connections can only be activated within the organization allowance; global provider definitions remain controlled by Command Center.</p></div>
                                 <Badge variant="outline">{integrationAccess.loading ? "CHECKING" : integrationAccess.enabled ? "ALLOWED" : "LOCKED"}</Badge>
                              </div>
                              {!integrationAccess.loading && !integrationAccess.enabled && <p className="mt-3 text-xs text-amber-200">{(integrationAccess.reason || "RESOLUTION_UNAVAILABLE").replaceAll("_", " ")}</p>}
                           </div>
                        </div>

                        {createdApiKey && (
                           <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6">
                              <p className="font-semibold text-emerald-200">Copy this secret now</p>
                              <code className="mt-3 block overflow-x-auto rounded-xl bg-black/30 p-4 text-sm text-emerald-100">{createdApiKey.plaintext_key}</code>
                              <Button variant="outline" className="mt-3" onClick={() => { void navigator.clipboard.writeText(createdApiKey.plaintext_key); toast.success("API key copied."); }}>
                                 Copy secret
                              </Button>
                           </div>
                        )}

                        <div className="grid gap-4">
                           {apiKeys.map((key) => (
                              <div key={key.id} className="rounded-[2rem] overflow-hidden border border-default glass-3d">
                                 <div 
                                    className="p-6 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-all"
                                    onClick={() => setExpandedApiKeyId(expandedApiKeyId === key.id ? null : key.id)}
                                 >
                                    <div className="flex items-center gap-5">
                                       <div className="h-12 w-12 rounded-2xl bg-white/5 border border-default flex items-center justify-center">
                                          <Key className="h-6 w-6 text-muted" />
                                       </div>
                                       <div>
                                          <p className="text-[14px] font-black text-[var(--text)]">{key.name}</p>
                                          <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1">Created {new Date(key.created_at).toLocaleString()}</p>
                                       </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                       <code className="bg-black/20 px-3 py-1.5 rounded-lg text-[10px] font-mono text-muted">{key.prefix}</code>
                                       <ChevronRight className={cn("h-5 w-5 text-muted transition-transform", expandedApiKeyId === key.id && "rotate-90")} />
                                    </div>
                                 </div>
                                 <AnimatePresence>
                                    {expandedApiKeyId === key.id && (
                                       <motion.div
                                          initial={{ height: 0, opacity: 0 }}
                                          animate={{ height: "auto", opacity: 1 }}
                                          exit={{ height: 0, opacity: 0 }}
                                          className="border-t border-default bg-black/10 p-8"
                                       >
                                          <div className="grid grid-cols-2 gap-8">
                                             <div className="space-y-4">
                                                <h4 className="text-[10px] font-black text-muted uppercase tracking-widest">Credential status</h4>
                                                <Badge variant="outline" className="text-[8px] font-black border-default">{key.is_active ? "ACTIVE" : "REVOKED"}</Badge>
                                             </div>
                                             <div className="space-y-4">
                                                <h4 className="text-[10px] font-black text-muted uppercase tracking-widest">Security Settings</h4>
                                                <div className="space-y-2">
                                                   <div className="flex items-center justify-between text-[11px] font-bold">
                                                      <span className="text-muted">Last used</span>
                                                      <span>{key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "Never"}</span>
                                                   </div>
                                                   <div className="flex items-center justify-between text-[11px] font-bold">
                                                      <span className="text-muted">Expires</span>
                                                      <span>{key.expires_at ? new Date(key.expires_at).toLocaleString() : "No expiry"}</span>
                                                   </div>
                                                </div>
                                             </div>
                                          </div>
                                          <div className="mt-8 pt-8 border-t border-default flex justify-end">
                                             <Button onClick={() => void revokeApiKey(key.id)} disabled={!key.is_active || !developerAccess.enabled} variant="ghost" className="text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10">
                                                Revoke API Key
                                             </Button>
                                          </div>
                                       </motion.div>
                                    )}
                                 </AnimatePresence>
                              </div>
                           ))}
                           {!apiKeysLoading && developerAccess.enabled && apiKeys.length === 0 && (
                              <div className="rounded-2xl border border-default p-8 text-center text-sm text-muted">No API keys have been created for this organization.</div>
                           )}
                           {apiKeysLoading && (
                              <div className="rounded-2xl border border-default p-8 text-center text-sm text-muted">Loading authoritative API key records…</div>
                           )}
                        </div>
                     </motion.div>
                  )}

                  {activeTab === "orgs" && isSuperAdmin && (

                     <motion.div
                        key="orgs"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-10"
                     >
                        <div>
                           <div>
                              <h3 className="text-xl font-black text-[var(--text)] mb-2">Organization Management</h3>
                              <p className="text-[13px] text-muted font-medium">Cross-organization administration is available only in Command Center.</p>
                           </div>
                        </div>

                        <Card className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-6">
                           <p className="font-semibold text-amber-200">Cross-organization administration is intentionally separated.</p>
                           <p className="mt-2 text-sm text-muted">Organization totals, revenue, subscriptions, users, storage, and lifecycle actions are authoritative in Command Center. Organizer Portal does not mirror or fabricate those records.</p>
                        </Card>

                        <div className="space-y-6">
                           <div className="flex items-center justify-between px-1">
                              <h4 className="text-[11px] font-black text-muted uppercase tracking-widest">Organization records</h4>
                              <Badge className="bg-amber-500/10 text-amber-300 border-0 text-[9px] font-black uppercase">Command Center only</Badge>
                           </div>
                           <div className="grid gap-4">
                              {([] as Array<{ id: string; name: string; tier: string; nodes: number; billing: string; status: string }>).map((org) => (
                                 <div key={org.id} className="rounded-[2.5rem] overflow-hidden border border-default glass-3d">
                                    <div 
                                       className="p-6 flex items-center justify-between group cursor-pointer hover:bg-white/5 transition-all"
                                       onClick={() => setExpandedOrgId(expandedOrgId === org.id ? null : org.id)}
                                    >
                                       <div className="flex items-center gap-5">
                                          <div className="h-12 w-12 rounded-2xl bg-white/5 border border-default flex items-center justify-center">
                                             <Building2 className="h-6 w-6 text-muted group-hover:text-[var(--pri)] transition-colors" />
                                          </div>
                                          <div>
                                             <p className="text-[14px] font-black text-[var(--text)]">{org.name}</p>
                                             <div className="flex items-center gap-3 mt-1 text-[10px] font-bold text-muted uppercase tracking-widest">
                                                <span className="text-[var(--pri)]">{org.tier}</span>
                                                <span>•</span>
                                                <span>{org.nodes} Events</span>
                                             </div>
                                          </div>
                                       </div>
                                       <div className="flex items-center gap-8">
                                          <div className="text-right">
                                             <p className="text-[13px] font-black text-[var(--text)]">{org.billing}</p>
                                             <span className={cn("text-[9px] font-black uppercase tracking-widest", org.status === 'Active' ? "text-green-500" : "text-red-500")}>{org.status}</span>
                                          </div>
                                          <ChevronRight className={cn("h-5 w-5 text-muted transition-transform", expandedOrgId === org.id && "rotate-90")} />
                                       </div>
                                    </div>
                                    <AnimatePresence>
                                       {expandedOrgId === org.id && (
                                          <motion.div
                                             initial={{ height: 0, opacity: 0 }}
                                             animate={{ height: "auto", opacity: 1 }}
                                             exit={{ height: 0, opacity: 0 }}
                                             className="border-t border-default bg-black/10 p-10"
                                          >
                                             <div className="grid grid-cols-3 gap-8">
                                                <div className="space-y-4">
                                                   <h4 className="text-[10px] font-black text-muted uppercase tracking-widest">Subscription</h4>
                                                   <p className="text-[14px] font-bold">Unavailable in Organizer Portal</p>
                                                   <p className="text-[11px] text-muted">Use the authoritative event contract in Command Center.</p>
                                                </div>
                                                <div className="space-y-4">
                                                   <h4 className="text-[10px] font-black text-muted uppercase tracking-widest">Storage & Usage</h4>
                                                   <div className="h-2 w-full bg-default rounded-full overflow-hidden">
                                                      <div className="h-full bg-[var(--pri)] w-0" />
                                                   </div>
                                                   <p className="text-[11px] font-bold">Usage unavailable</p>
                                                </div>
                                                <div className="space-y-4">
                                                   <h4 className="text-[10px] font-black text-muted uppercase tracking-widest">Administration</h4>
                                                   <p className="text-[11px] text-muted">Invoices and cross-organization user controls are managed in Command Center.</p>
                                                </div>
                                             </div>
                                          </motion.div>
                                       )}
                                    </AnimatePresence>
                                 </div>
                              ))}
                           </div>

                        </div>
                     </motion.div>
                  )}

                  {activeTab === "system" && isSuperAdmin && (
                     <motion.div
                        key="system"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-12 relative z-10"
                     >
                        <div>
                           <h3 className="text-xl font-black text-[var(--text)] mb-2">System Configurations</h3>
                           <p className="text-[13px] text-muted font-medium tracking-tight">Configure global options for the entire event ecosystem.</p>
                        </div>

                        <div className="p-10 rounded-[3rem] glass-3d border-default bg-[var(--pri)]/5 space-y-8">
                           <div className="flex items-center gap-4">
                              <Globe className="h-6 w-6 text-[var(--pri)]" />
                              <div>
                                 <h4 className="text-[15px] font-black text-[var(--text)] uppercase tracking-widest">Global Timezone</h4>
                                 <p className="text-[11px] text-muted font-medium mt-1 leading-relaxed">
                                    All dates, deadlines, schedules, agenda exports, and emails will use this timezone.
                                 </p>
                              </div>
                           </div>

                           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-default">
                              <div className="space-y-3">
                                 <label className="text-[10px] font-black text-muted uppercase tracking-widest px-1">Selected Timezone</label>
                                 <select
                                    value={systemTimezone}
                                    onChange={(e) => setSystemTimezone(e.target.value)}
                                    className="w-full h-14 bg-[var(--base)]/50 border border-default rounded-2xl px-5 font-bold focus:outline-none focus:border-[var(--pri)]/50 transition-all cursor-pointer text-[14px]"
                                 >
                                    <option value="Asia/Kolkata">Asia/Kolkata (IST - UTC+05:30)</option>
                                    <option value="UTC">UTC (Coordinated Universal Time - UTC+00:00)</option>
                                    <option value="America/New_York">America/New_York (EST/EDT - UTC-05:00/04:00)</option>
                                    <option value="America/Chicago">America/Chicago (CST/CDT - UTC-06:00/05:00)</option>
                                    <option value="America/Denver">America/Denver (MST/MDT - UTC-07:00/06:00)</option>
                                    <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT - UTC-08:00/07:00)</option>
                                    <option value="Europe/London">Europe/London (GMT/BST - UTC+00:00/01:00)</option>
                                    <option value="Europe/Paris">Europe/Paris (CET/CEST - UTC+01:00/02:00)</option>
                                    <option value="Asia/Singapore">Asia/Singapore (SGT - UTC+08:00)</option>
                                    <option value="Asia/Tokyo">Asia/Tokyo (JST - UTC+09:00)</option>
                                    <option value="Australia/Sydney">Australia/Sydney (AEST/AEDT - UTC+10:00/11:00)</option>
                                 </select>
                              </div>
                           </div>

                           <div className="flex justify-end pt-4 border-t border-default">
                              <Button
                                 onClick={handleSaveSystemSettings}
                                 disabled={isSavingSystem}
                                 className="h-12 px-8 bg-[var(--pri)] text-white font-black uppercase tracking-widest text-[10px] rounded-xl border-0 flex items-center gap-2"
                              >
                                 {isSavingSystem ? (
                                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                 ) : (
                                    <Save className="h-4 w-4" />
                                 )}
                                 Save System Settings
                              </Button>
                           </div>
                        </div>
                     </motion.div>
                  )}
               </AnimatePresence>

               <div className="mt-auto pt-12 flex items-center gap-4 p-8 rounded-[2.5rem] bg-white/5 border border-default">
                  <Info className="h-6 w-6 text-[var(--pri)] shrink-0" />
                  <p className="text-[11px] text-muted font-medium uppercase tracking-wide">
                     Security Notice: All profile changes are logged for security purposes. Last sync: {new Date().toLocaleTimeString()}
                  </p>
               </div>
            </Card>
         </div>
      </div>
   );
}

export default function SettingsPage() {
   return (
      <Suspense fallback={
         <div className="h-[70vh] flex flex-col items-center justify-center space-y-6">
            <div className="h-16 w-16 border-4 border-[var(--pri)] border-t-transparent rounded-full animate-spin shadow-[0_0_20px_var(--pri)]" />
            <p className="text-[10px] font-black text-muted uppercase tracking-[0.4em] animate-pulse">Syncing Account...</p>
         </div>
      }>
         <SettingsPageContent />
      </Suspense>
   );
}
