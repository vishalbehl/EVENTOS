"use client";

import { useState, useEffect } from "react";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, 
  DialogDescription, DialogFooter 
} from "../../ui/dialog";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { 
  Select, SelectContent, SelectItem, 
  SelectTrigger, SelectValue 
} from "../../ui/select";
import { Label } from "../../ui/label";
import { Badge } from "../../ui/badge";
import { toast } from "sonner";
import { useAuthStore } from "@/store/use-auth-store";
import { Trash2, Plus, Shield, Globe, Lock, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRemoteEventLimitAccess } from "@/lib/capabilities";

interface ManageNodeDialogProps {
  user: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: any[];
  onSuccess: () => void;
}

const ROLE_DESCRIPTIONS = {
  super_admin: "Super Admin [Full Control]: Can manage the entire platform, all organizations, billings, and global settings.",
  admin: "Admin [Full or Partial]: Full access to assigned organizations and control over user accounts.",
  event_organizer: "Organizer [Limited]: Restricted to assigned events only. Can manage sessions and speakers for those events.",
  session_manager: "Session Manager [Limited]: Limited to specific sessions within an event. Can only edit details for assigned time blocks.",
};

export function ManageNodeDialog({ user, open, onOpenChange, roles, onSuccess }: ManageNodeDialogProps) {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [isFetchingEvents, setIsFetchingEvents] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState("none");
  const assignmentLimitAccess = useRemoteEventLimitAccess(
    selectedEventId === "none" ? undefined : selectedEventId,
    "max_event_team_members",
  );
  
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    role: "",
    is_active: true,
  });

  useEffect(() => {
    if (user) {
      setFormData({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        role: user.role || "",
        is_active: user.is_active,
      });
    }
  }, [user]);

  const fetchEvents = async () => {
    setIsFetchingEvents(true);
    try {
      const token = useAuthStore.getState().accessToken;
      if (!token) return;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/events`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error("Could not load events");
      const data = await response.json();
      setEvents(data);
    } catch (error: any) {
      console.error("Failed to fetch events", error);
      toast.error(error.message);
    } finally {
      setIsFetchingEvents(false);
    }
  };

  useEffect(() => {
    if (open) fetchEvents();
  }, [open]);

  const handleUpdateUser = async () => {
    if (formData.role === 'super_admin') {
      const superAdminCount = roles.find(r => r.name === 'Super Admin')?.users_count || 0;
      if (superAdminCount >= 3 && user.role !== 'super_admin') {
        toast.error("Super Admin limit reached (Max 3). Revoke another administrator first.");
        return;
      }
    }
    setLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useAuthStore.getState().accessToken}`,
          'Idempotency-Key': crypto.randomUUID()
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) throw new Error("Failed to update permissions");

      toast.success("Permissions updated");
      onSuccess();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAssignment = async () => {
    if (selectedEventId === "none") return;
    setLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useAuthStore.getState().accessToken}`,
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          user_id: user.id,
          event_id: selectedEventId,
          permissions: { level: formData.role === 'session_manager' ? "partial" : "full" }
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "This user is already assigned to this event");
      }

      toast.success("User assigned to event");
      setSelectedEventId("none");
      onSuccess();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/assignments/${assignmentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${useAuthStore.getState().accessToken}`
        }
      });

      if (!response.ok) throw new Error("Failed to remove assignment");

      toast.success("Event permissions removed");
      onSuccess();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-3d border-default max-w-2xl rounded-[3rem] p-0 overflow-hidden shadow-2xl animate-fade-in">
        <div className="flex flex-col md:flex-row min-h-[500px] max-h-[85vh]">
          {/* Sidebar */}
          <div className="w-64 bg-white/5 border-r border-default p-8 space-y-8">
            <div className="space-y-4">
              <div className="h-20 w-20 rounded-[1.5rem] bg-[var(--pri)]/10 border border-[var(--pri)]/20 flex items-center justify-center font-black text-2xl text-[var(--pri)]">
                {user.avatar_url ? (
                  <img src={user.avatar_url} className="h-full w-full object-cover rounded-[1.5rem]" />
                ) : (
                  <span>{user.first_name[0]}{user.last_name[0]}</span>
                )}
              </div>
              <div>
                <h3 className="font-black text-lg tracking-tighter leading-tight">{user.first_name} {user.last_name}</h3>
                <p className="text-[10px] font-black text-[var(--pri)] uppercase tracking-widest mt-1">{user.role.replace('_', ' ')}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[9px] font-black text-muted uppercase tracking-widest px-1">Account Status</p>
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-default">
                 <span className="text-[11px] font-bold">Active</span>
                 <div 
                   onClick={() => setFormData({...formData, is_active: !formData.is_active})}
                   className={cn(
                     "h-5 w-10 rounded-full p-0.5 cursor-pointer transition-all",
                     formData.is_active ? "bg-green-500" : "bg-red-500"
                   )}
                 >
                    <div className={cn("h-4 w-4 bg-white rounded-full transition-all shadow-sm", formData.is_active ? "ml-5" : "ml-0")} />
                 </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 p-10 overflow-y-auto no-scrollbar space-y-10">
            <section className="space-y-6">
              <div className="flex items-center gap-3">
                <Shield className="h-4 w-4 text-[var(--pri)]" />
                <h4 className="text-[11px] font-black text-muted uppercase tracking-widest">Permissions</h4>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted px-1">Role</Label>
                  <Select 
                    value={formData.role} 
                    onValueChange={(val: string) => setFormData({...formData, role: val})}
                  >
                    <SelectTrigger className="h-12 bg-[var(--base)] border-default rounded-xl font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-3d border-default rounded-2xl">
                      <SelectItem value="super_admin" className="font-bold py-3" disabled={roles.find(r => r.name === 'Super Admin')?.users_count >= 3 && user.role !== 'super_admin'}>
                        Super Admin [Full Control] {roles.find(r => r.name === 'Super Admin')?.users_count >= 3 && user.role !== 'super_admin' && "(Limit Reached)"}
                      </SelectItem>
                      <SelectItem value="admin" className="font-bold py-3">Admin [Full or Partial]</SelectItem>
                      <SelectItem value="event_organizer" className="font-bold py-3">Organizer [Assigned Events Only]</SelectItem>
                      <SelectItem value="session_manager" className="font-bold py-3">Session Manager [Limited Access]</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted font-medium px-1 mt-2 leading-relaxed italic">
                    {ROLE_DESCRIPTIONS[formData.role as keyof typeof ROLE_DESCRIPTIONS]}
                  </p>
                </div>
              </div>

              <Button onClick={handleUpdateUser} disabled={loading} className="w-full bg-[var(--pri)] text-white font-black uppercase tracking-widest text-[10px] rounded-xl h-12 shadow-lg">
                Update Permissions
              </Button>
            </section>

            <section className="space-y-6 pt-6 border-t border-default">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-[var(--pri)]" />
                  <h4 className="text-[11px] font-black text-muted uppercase tracking-widest">Event Assignments</h4>
                </div>
              </div>

              <div className="flex gap-3">
                <Select value={selectedEventId} onValueChange={setSelectedEventId} disabled={isFetchingEvents}>
                  <SelectTrigger className="flex-1 h-11 bg-[var(--base)] border-default rounded-xl font-bold text-[12px]">
                    <SelectValue placeholder={isFetchingEvents ? "Loading..." : "Assign new event..."} />
                  </SelectTrigger>
                  <SelectContent className="glass-3d border-default rounded-2xl">
                    <SelectItem value="none" className="font-bold py-3 italic">Choose Event...</SelectItem>
                    {events.map(event => (
                      <SelectItem key={event.id} value={event.id} className="font-bold py-3">{event.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAddAssignment}
                  disabled={
                    loading
                    || selectedEventId === "none"
                    || assignmentLimitAccess.loading
                    || !assignmentLimitAccess.enabled
                  }
                  title={
                    assignmentLimitAccess.enabled
                      ? undefined
                      : `Unavailable: ${(assignmentLimitAccess.reason || "RESOLUTION_UNAVAILABLE").replaceAll("_", " ").toLowerCase()}`
                  }
                  className="bg-[var(--pri)] text-white font-black px-4 rounded-xl h-11"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-3">
                {user.assignments?.map((as: any) => {
                  const event = events.find(e => e.id === as.event_id);
                  return (
                    <div key={as.event_id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-default group">
                      <div className="flex items-center gap-3 text-muted">
                        <Globe className="h-4 w-4" />
                        <span className="text-[13px] font-bold truncate max-w-[200px] text-[var(--text)]">{event?.title || "Event Loading..."}</span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleRemoveAssignment(as.id)}
                        className="h-8 w-8 rounded-lg hover:bg-red-500/10 hover:text-red-500 opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
