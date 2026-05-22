"use client";

import { useParams } from "next/navigation";
import { Settings, Save, Globe, Smartphone, Bell, Shield, Info, Sliders, MapPin, Calendar, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useEvent, useUpdateEvent } from "@/hooks/useEvents";
import { toast } from "sonner";

export default function EventSettingsPage() {
  const { eventId } = useParams();
  const { data: event } = useEvent(eventId as string);
  const updateEvent = useUpdateEvent(eventId as string);

  const handleToggle = async (key: string) => {
    if (!event) return;
    
    const currentToggles = event.feature_toggles || {};
    const updatedToggles = {
      ...currentToggles,
      [key]: !currentToggles[key]
    };

    try {
      await updateEvent.mutateAsync({
        feature_toggles: updatedToggles
      });
      toast.success("Workflow setting updated");
    } catch (error) {
      toast.error("Failed to update setting");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const data = {
      short_code: formData.get("short_code") as string,
      timezone: formData.get("timezone") as string,
    };

    try {
      await updateEvent.mutateAsync(data);
      toast.success("Event configuration saved");
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "Failed to save configuration");
    }
  };

  const WORKFLOW_MODS = [
    { key: "enable_auto_approval", label: "Automatic Approval", desc: "Approve uploads from verified speakers" },
    { key: "enable_srr", label: "On-site Check-in", desc: "Enable digital badges for physical venue" },
    { key: "enable_moderator", label: "Live Q&A Stream", desc: "Enable interactive session components" },
  ];

  return (
    <div className="space-y-10 animate-fade-in pb-20">
      <form onSubmit={handleSave}>
        <header className="flex flex-col md:flex-row items-center justify-between gap-6 px-2 mb-10">
          <div>
             <h1 className="text-3xl font-black tracking-tighter text-[var(--text)] mb-2 text-glow-indigo">
               Event <span className="text-[var(--pri)]">Settings</span>
             </h1>
             <p className="text-[13px] font-bold text-muted uppercase tracking-[0.3em]">Configure {event?.name || 'this event'}</p>
          </div>
          <Button 
            type="submit"
            disabled={updateEvent.isPending}
            className="h-12 px-10 bg-[var(--pri)] hover:bg-[var(--sec)] text-[var(--text)] font-black uppercase tracking-widest text-[11px] rounded-full shadow-lg border-0 hover-lift-3d"
          >
             {updateEvent.isPending ? "Saving..." : <><Save className="mr-2 h-4 w-4" /> Save Configuration</>}
          </Button>
        </header>

        <div className="grid gap-10 lg:grid-cols-2">
          <Card className="glass-3d border-default rounded-[2.5rem] p-10 space-y-8">
            <div className="flex items-center gap-4 mb-4">
               <div className="h-12 w-12 rounded-xl bg-[var(--pri)]/10 flex items-center justify-center">
                  <Globe className="h-6 w-6 text-[var(--pri)]" />
               </div>
               <h3 className="text-xl font-black text-[var(--text)] tracking-tight">Public Presence</h3>
            </div>
            
            <div className="space-y-6">
               <div className="space-y-3">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest px-1">Event URL Slug</label>
                  <div className="neomorphic-inset rounded-2xl p-0.5 border border-default">
                     <Input 
                        name="short_code"
                        defaultValue={event?.short_code || ""} 
                        className="h-12 bg-transparent border-0 rounded-2xl px-5 text-[14px] font-bold text-[var(--text)] focus-visible:ring-0" 
                     />
                  </div>
               </div>
               <div className="space-y-3">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest px-1">Timezone Context</label>
                  <div className="neomorphic-inset rounded-2xl p-0.5 border border-default">
                     <Input 
                        name="timezone"
                        defaultValue={event?.timezone || "UTC"} 
                        className="h-12 bg-transparent border-0 rounded-2xl px-5 text-[14px] font-bold text-[var(--text)] focus-visible:ring-0" 
                     />
                  </div>
               </div>
            </div>
          </Card>

        <Card className="glass-3d border-default rounded-[2.5rem] p-10 space-y-8">
          <div className="flex items-center gap-4 mb-4">
             <div className="h-12 w-12 rounded-xl bg-[var(--sec)]/10 flex items-center justify-center">
                <Sliders className="h-6 w-6 text-[var(--sec)]" />
             </div>
             <h3 className="text-xl font-black text-[var(--text)] tracking-tight">Operational Logic</h3>
          </div>

          <div className="space-y-6">
             {WORKFLOW_MODS.map((mod) => {
               const isActive = !!event?.feature_toggles?.[mod.key];
               return (
                 <div key={mod.key} className="flex items-center justify-between p-4 rounded-2xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-default">
                    <div>
                       <p className="text-[13px] font-bold text-[var(--text)]">{mod.label}</p>
                       <p className="text-[10px] font-black text-muted uppercase tracking-widest mt-1">{mod.desc}</p>
                    </div>
                    <div 
                      onClick={() => handleToggle(mod.key)}
                      className={`h-6 w-12 rounded-full p-1 transition-all cursor-pointer ${isActive ? 'bg-[var(--pri)]' : 'bg-[color-mix(in_srgb,var(--text)_5%,transparent)]'}`}
                    >
                       <div className={`h-4 w-4 bg-[var(--text)] rounded-full transition-all ${isActive ? 'ml-6' : 'ml-0'}`} />
                    </div>
                 </div>
               );
             })}
          </div>
        </Card>
      </div>

      <Card className="glass-3d border-default rounded-[2.5rem] p-10 mt-10">
         <div className="flex items-center gap-4 mb-10">
            <div className="h-12 w-12 rounded-xl bg-[var(--warn)]/10 flex items-center justify-center">
               <Shield className="h-6 w-6 text-[var(--warn)]" />
            </div>
            <div>
               <h3 className="text-xl font-black text-[var(--text)] tracking-tight">Access Control</h3>
               <p className="text-[11px] font-black text-muted uppercase tracking-widest mt-1">Manage team permissions for this event</p>
            </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
               { label: "Administrators", count: 2, icon: Shield },
               { label: "Moderators", count: 5, icon: Users },
               { label: "Technicians", count: 3, icon: Settings },
            ].map((role, i) => (
               <div key={i} className="p-6 rounded-3xl glass-3d border-default flex items-center justify-between group cursor-pointer hover:bg-[var(--pri)]/5 transition-all">
                  <div className="flex items-center gap-4">
                     <role.icon className="h-5 w-5 text-muted group-hover:text-[var(--pri)]" />
                     <div>
                        <p className="text-[13px] font-bold text-[var(--text)]">{role.label}</p>
                        <p className="text-[10px] font-black text-muted uppercase tracking-widest">{role.count} Active Nodes</p>
                     </div>
                  </div>
                  <Badge variant="outline" className="border-default text-muted font-black text-[9px] px-2 py-0.5">Manage</Badge>
               </div>
            ))}
         </div>
       </Card>
      </form>
    </div>
  );
}
