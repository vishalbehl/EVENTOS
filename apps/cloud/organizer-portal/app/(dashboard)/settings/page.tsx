"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
   User, Bell, Shield, AppWindow, Key, CreditCard,
   Settings, Save, Globe, Smartphone, Mail, Lock,
   Fingerprint, Zap, Code, ExternalLink, ChevronRight,
   Monitor, Palette, Trash2, CheckCircle2, Box, Info, Plus, Layers,
   Users, Building2, Receipt, FileText, BarChart3, Phone, Camera
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useFloatingToolbarStore } from "@/store/useFloatingToolbarStore";
import { useAuthStore } from "@/store/use-auth-store";
import { toast } from "sonner";

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
      setToolbarActions([
         { label: "Save Profile", icon: Save, onClick: handleSaveProfile, color: "bg-[var(--pri)]/10" },
      ]);
   }, [setToolbarActions, formData]);

   const baseTabs = [
      { id: "profile", label: "My Profile", icon: User },
      { id: "security", label: "Security & Access", icon: Shield },
      { id: "notifications", label: "Notifications", icon: Bell },
   ];

   const isSuperAdmin = user?.role?.toLowerCase().replace(/[\s_]/g, '') === 'superadmin';

   const adminTabs = isSuperAdmin ? [
      { id: "api", label: "Developer Keys", icon: Key },
      { id: "orgs", label: "Organizations", icon: Building2 },
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
               onClick={handleSaveProfile}
               disabled={isSaving}
               className="h-12 px-10 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full shadow-lg border-0 transition-all"
            >
               {isSaving ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" /> : <Save className="mr-2 h-4 w-4" />}
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
                                 disabled={user?.role !== 'super_admin'}
                                 onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                 className={cn(
                                    "h-14 bg-[var(--base)]/50 border-default rounded-2xl px-5 font-bold",
                                    user?.role !== 'super_admin' && "opacity-60 cursor-not-allowed"
                                 )}
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
                        <div className="grid gap-4">
                           {[
                              { label: "New User Alerts", desc: "Notify when a new account is created", active: true },
                              { label: "System Maintenance", desc: "Alerts about planned downtime", active: true },
                              { label: "Account Activity", desc: "Notify on login from new devices", active: false },
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
                     </motion.div>
                  )}

                  {activeTab === "api" && isSuperAdmin && (
                     <motion.div
                        key="api"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-10"
                     >
                        <div className="flex items-center justify-between">
                           <div>
                              <h3 className="text-xl font-black text-[var(--text)] mb-2">Developer Access</h3>
                              <p className="text-[13px] text-muted font-medium">Manage API keys and developer integration endpoints.</p>
                           </div>
                           <Button className="h-10 bg-[var(--pri)] text-white rounded-xl text-[10px] font-black uppercase tracking-widest px-6">
                              <Plus className="mr-2 h-4 w-4" /> Create API Key
                           </Button>
                        </div>

                        <div className="grid gap-4">
                           {[
                              { id: "key_1", name: "Main Website Integration", prefix: "ev_live_...", created: "2026-04-12", status: "Active" },
                              { id: "key_2", name: "Mobile App Wrapper", prefix: "ev_live_...", created: "2026-05-01", status: "Active" },
                           ].map((key) => (
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
                                          <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1">Created on {key.created}</p>
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
                                                <h4 className="text-[10px] font-black text-muted uppercase tracking-widest">Permissions</h4>
                                                <div className="flex flex-wrap gap-2">
                                                   <Badge variant="outline" className="text-[8px] font-black border-default">READ_SESSIONS</Badge>
                                                   <Badge variant="outline" className="text-[8px] font-black border-default">READ_SPEAKERS</Badge>
                                                   <Badge variant="outline" className="text-[8px] font-black border-default">WRITE_ANALYTICS</Badge>
                                                </div>
                                             </div>
                                             <div className="space-y-4">
                                                <h4 className="text-[10px] font-black text-muted uppercase tracking-widest">Security Settings</h4>
                                                <div className="space-y-2">
                                                   <div className="flex items-center justify-between text-[11px] font-bold">
                                                      <span className="text-muted">IP Restriction</span>
                                                      <span>192.168.1.*</span>
                                                   </div>
                                                   <div className="flex items-center justify-between text-[11px] font-bold">
                                                      <span className="text-muted">Rate Limit</span>
                                                      <span>10,000 req/min</span>
                                                   </div>
                                                </div>
                                             </div>
                                          </div>
                                          <div className="mt-8 pt-8 border-t border-default flex justify-end">
                                             <Button variant="ghost" className="text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10">
                                                Revoke API Key
                                             </Button>
                                          </div>
                                       </motion.div>
                                    )}
                                 </AnimatePresence>
                              </div>
                           ))}
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
                        <div className="flex items-center justify-between">
                           <div>
                              <h3 className="text-xl font-black text-[var(--text)] mb-2">Organization Management</h3>
                              <p className="text-[13px] text-muted font-medium">Manage organizations, billing, and global settings.</p>
                           </div>
                           <Button className="h-10 bg-[var(--pri)] text-white rounded-xl text-[10px] font-black uppercase tracking-widest px-6">
                              <Plus className="mr-2 h-4 w-4" /> Add Organization
                           </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                           {[
                              { label: "Active Events", val: "142", icon: Layers },
                              { label: "Total Revenue", val: "$12,480", icon: BarChart3 },
                              { label: "Organizations", val: "12", icon: Building2 },
                           ].map((stat, i) => (
                              <Card key={i} className="glass-3d border-default rounded-3xl p-6 bg-white/5">
                                 <stat.icon className="h-5 w-5 text-[var(--pri)] mb-4" />
                                 <p className="text-2xl font-black text-[var(--text)] tracking-tighter">{stat.val}</p>
                                 <p className="text-[10px] font-black text-muted uppercase tracking-widest mt-1">{stat.label}</p>
                              </Card>
                           ))}
                        </div>

                        <div className="space-y-6">
                           <div className="flex items-center justify-between px-1">
                              <h4 className="text-[11px] font-black text-muted uppercase tracking-widest">Enterprise Organizations</h4>
                              <Badge className="bg-green-500/10 text-green-500 border-0 text-[9px] font-black uppercase">Live Billing</Badge>
                           </div>
                           <div className="grid gap-4">
                              {[
                                 { id: "org_1", name: "Global Med Conf", tier: "Platinum Tier", nodes: 24, billing: "$1,200/mo", status: "Active" },
                                 { id: "org_2", name: "Tech Summit 2026", tier: "Growth Tier", nodes: 8, billing: "$450/mo", status: "Past Due" },
                                 { id: "org_3", name: "BioTech Forum", tier: "Starter", nodes: 2, billing: "$150/mo", status: "Active" },
                              ].map((org) => (
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
                                                   <p className="text-[14px] font-bold">Annual Platinum Plan</p>
                                                   <p className="text-[11px] text-muted">Renewal Date: Jan 1, 2027</p>
                                                </div>
                                                <div className="space-y-4">
                                                   <h4 className="text-[10px] font-black text-muted uppercase tracking-widest">Storage & Usage</h4>
                                                   <div className="h-2 w-full bg-default rounded-full overflow-hidden">
                                                      <div className="h-full bg-[var(--pri)] w-[65%]" />
                                                   </div>
                                                   <p className="text-[11px] font-bold">650GB / 1TB Used</p>
                                                </div>
                                                <div className="space-y-4">
                                                   <h4 className="text-[10px] font-black text-muted uppercase tracking-widest">Quick Actions</h4>
                                                   <div className="flex flex-col gap-2">
                                                      <Button variant="outline" className="h-9 text-[9px] font-black uppercase tracking-widest rounded-xl border-default">View Invoices</Button>
                                                      <Button variant="outline" className="h-9 text-[9px] font-black uppercase tracking-widest rounded-xl border-default">Manage Users</Button>
                                                   </div>
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
