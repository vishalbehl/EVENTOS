"use client";

import { useState, useEffect } from "react";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, 
  DialogDescription, DialogFooter 
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { 
  Select, SelectContent, SelectItem, 
  SelectTrigger, SelectValue 
} from "../ui/select";
import { Label } from "../ui/label";
import { toast } from "sonner";
import { useAuthStore } from "@/store/use-auth-store";

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: any[];
  onSuccess: () => void;
}

export function CreateUserDialog({ open, onOpenChange, roles, onSuccess }: CreateUserDialogProps) {
  const [loading, setLoading] = useState(false);
  const { user: currentUser } = useAuthStore();
  const [events, setEvents] = useState<any[]>([]);
  const [isFetchingEvents, setIsFetchingEvents] = useState(false);
  
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    phone: "",
    role: currentUser?.role === 'super_admin' ? "organiser" : "admin",
    assigned_event_id: "none",
  });

  const [superAdminCount, setSuperAdminCount] = useState(0);

  const fetchInitialData = async () => {
    const token = useAuthStore.getState().accessToken;
    if (!token) return;

    setIsFetchingEvents(true);

    try {
      // Fetch Events
    const evRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8002"}/api/v1/events`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (evRes.ok) setEvents(await evRes.json());

      // Fetch current Super Admin count
      const uRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (uRes.ok) {
        const users = await uRes.json();
        const list = Array.isArray(users) ? users : (users.data || []);
        setSuperAdminCount(list.filter((u: any) => u.role === "super_admin").length);
      }
    } catch (error: any) {
      toast.error("Failed to sync system data");
    } finally {
      setIsFetchingEvents(false);
    }
  };

  useEffect(() => {
    if (open) fetchInitialData();
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.role === "super_admin" && superAdminCount >= 3) {
      toast.error("Security: Maximum limit of 3 Super Admin accounts reached.");
      return;
    }

    setLoading(true);

    try {
      // 1. Create User
      const userResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useAuthStore.getState().accessToken}`
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          first_name: formData.first_name,
          last_name: formData.last_name,
          phone: formData.phone,
          role: formData.role,
          organization_id: currentUser?.organization_id,
          is_active: true
        })
      });

      if (!userResponse.ok) {
        const error = await userResponse.json();
        throw new Error(error.detail || "Failed to create user account");
      }

      const newUser = await userResponse.json();

      // 2. Create Assignment if event selected
      if (formData.assigned_event_id !== "none") {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/assignments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${useAuthStore.getState().accessToken}`
          },
          body: JSON.stringify({
            user_id: newUser.id,
            event_id: formData.assigned_event_id,
            permissions: { level: formData.role === 'session_manager' ? "partial" : "full" }
          })
        });
      }

      toast.success("User account created successfully");
      onSuccess();
      onOpenChange(false);
      setFormData({ 
        first_name: "", last_name: "", email: "", password: "", phone: "",
        role: currentUser?.role === 'super_admin' ? "organiser" : "admin",
        assigned_event_id: "none" 
      });
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-3d border-default max-w-md rounded-[2.5rem] p-8">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black text-[var(--text)] tracking-tighter">Create User Account</DialogTitle>
          <DialogDescription className="text-muted font-medium">Add a new team member and assign their access level.</DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted px-1">First Name</Label>
              <Input 
                required
                className="h-12 bg-[var(--base)]/50 border-default rounded-xl font-bold" 
                value={formData.first_name}
                onChange={e => setFormData({...formData, first_name: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted px-1">Last Name</Label>
              <Input 
                required
                className="h-12 bg-[var(--base)]/50 border-default rounded-xl font-bold"
                value={formData.last_name}
                onChange={e => setFormData({...formData, last_name: e.target.value})}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted px-1">Email Address</Label>
            <Input 
              required
              type="email"
              className="h-12 bg-[var(--base)]/50 border-default rounded-xl font-bold"
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted px-1">Password</Label>
            <Input 
              required
              type="password"
              className="h-12 bg-[var(--base)]/50 border-default rounded-xl font-bold"
              value={formData.password}
              onChange={e => setFormData({...formData, password: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted px-1">Access Level</Label>
              <Select 
                value={formData.role} 
                onValueChange={(val: string) => setFormData({...formData, role: val})}
              >
                <SelectTrigger className="h-12 bg-[var(--base)]/50 border-default rounded-xl font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-3d border-default rounded-2xl">
                  {currentUser?.role === 'super_admin' && (
                    <>
                      <SelectItem 
                        value="super_admin" 
                        className="font-bold py-3 text-red-500"
                        disabled={roles?.find(r => r.name === 'Super Admin')?.users_count >= 3}
                      >
                        Super Admin {roles?.find(r => r.name === 'Super Admin')?.users_count >= 3 && "(Limit Reached)"}
                      </SelectItem>
                      <SelectItem value="organiser" className="font-bold py-3 text-[var(--pri)]">Organiser</SelectItem>
                    </>
                  )}
                  <SelectItem value="admin" className="font-bold py-3">Admin</SelectItem>
                  <SelectItem value="session_manager" className="font-bold py-3">Session Manager</SelectItem>
                  <SelectItem value="technician" className="font-bold py-3">Technician</SelectItem>
                  <SelectItem value="volunteer" className="font-bold py-3">Volunteer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted px-1">Assign Event</Label>
              <Select 
                value={formData.assigned_event_id} 
                onValueChange={(val: string) => setFormData({...formData, assigned_event_id: val})}
                disabled={isFetchingEvents}
              >
                <SelectTrigger className="h-12 bg-[var(--base)]/50 border-default rounded-xl font-bold">
                  <SelectValue placeholder={isFetchingEvents ? "Loading..." : "Select..."} />
                </SelectTrigger>
                <SelectContent className="glass-3d border-default rounded-2xl">
                  <SelectItem value="none" className="font-bold py-3 italic">None (Global)</SelectItem>
                  {events.map(event => (
                    <SelectItem key={event.id} value={event.id} className="font-bold py-3">{event.title || event.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button 
            type="submit" 
            disabled={loading}
            className="w-full h-14 bg-[var(--pri)] hover:bg-[var(--sec)] text-white font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-xl mt-4"
          >
            {loading ? "Creating Account..." : "Create User Account"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
