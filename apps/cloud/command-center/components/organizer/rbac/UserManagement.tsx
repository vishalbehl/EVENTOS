"use client";

import React, { useState, useEffect } from "react";
import {
  UserPlus,
  Search,
  Shield,
  Mail,
  Key,
  ChevronRight,
  MoreVertical,
  Check,
  X,
  Briefcase,
  Calendar,
  Lock,
  User,
  Globe,
  Box,
  Layers,
  MessageSquare,
  Send,
  DollarSign,
  CreditCard,
  Activity,
  BarChart3,
  Settings,
  Zap,
  ShieldAlert,
  Monitor,
  Upload,
  RefreshCw,
  AlertTriangle,
  Users,
  FileText,
  PlusCircle,
  Trash2,
  Edit2,
  LockKeyhole,
  Info,
  Eye,
  MapPin,
  LayoutDashboard,
  Settings2,
  Fingerprint,
  ShieldCheck,
  KeyRound,
  Power,
  Palette,
  ShieldPlus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "../../ui/dialog";
import { ScrollArea } from "../../ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "../../ui/avatar";
import { motion, AnimatePresence } from "framer-motion";
import { Label } from "../../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { Input } from "../../ui/input";
import { Switch } from "../../ui/switch";
import { Textarea } from "../../ui/textarea";
import { Card, CardContent } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/use-auth-store";
import { CreateUserDialog } from "./CreateUserDialog";

// ── Types ──────────────────────────────────────────────────

interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  users_count: number;
  scope: "Global" | "Organization" | "Event" | "Session" | "Self";
  status: "Active" | "Restricted" | "Inherited";
  is_system_role: boolean;
}

interface UserDefinition {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  avatar_url?: string;
  phone?: string;
  is_2fa_enabled?: boolean;
  assignments?: any[];
}

const MODULE_METADATA: Record<string, { name: string; description: string; icon: any }> = {
  "USERS": { name: "User Management", description: "Manage identity, access, and security profiles.", icon: User },
  "EVENTS": { name: "Event Engine", description: "Global event lifecycle and orchestration controls.", icon: Calendar },
  "SESSIONS": { name: "Session Studio", description: "Program scheduling and technical stage management.", icon: Layers },
  "FINANCE": { name: "Revenue Hub", description: "Quotations, invoices, and payment reconciliation.", icon: DollarSign },
  "EMAIL": { name: "Comms Center", description: "Marketing campaigns and transactional notifications.", icon: Send },
  "FILES": { name: "Content Vault", description: "Asset management and speaker material auditing.", icon: Box },
  "ANALYTICS": { name: "Insight Engine", description: "Real-time surveillance and data visualization.", icon: BarChart3 },
  "SYSTEM": { name: "Core Config", description: "Infrastructure settings and global platform state.", icon: Zap },
};

const ROLE_PRIORITY: Record<string, number> = {
  "super_admin": 1,
  "admin": 2,
  "organizer": 3,
  "moderator": 4,
  "speaker": 5,
  "user": 6
};

export function UserManagement() {
  const { user: currentUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [allUsers, setAllUsers] = useState<UserDefinition[]>([]);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Sorting helper for roles
  const sortedRoles = [...roles].sort((a, b) => {
    const pA = ROLE_PRIORITY[a.name.toLowerCase().replace(" ", "_")] || 100;
    const pB = ROLE_PRIORITY[b.name.toLowerCase().replace(" ", "_")] || 100;
    return pA - pB;
  });
  
  // Modals
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isCreateRoleOpen, setIsCreateRoleOpen] = useState(false);
  const [isUserListOpen, setIsUserListOpen] = useState(false);
  const [isMatrixDialogOpen, setIsMatrixDialogOpen] = useState(false);
  const [selectedRoleForUsers, setSelectedRoleForUsers] = useState<RoleDefinition | null>(null);
  const [selectedModuleForMatrix, setSelectedModuleForMatrix] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<RoleDefinition | null>(null);
  const [roleUsers, setRoleUsers] = useState<UserDefinition[]>([]);

  // Sidebar
  const [isEditSidebarOpen, setIsEditSidebarOpen] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<UserDefinition | null>(null);
  const [sidebarView, setSidebarView] = useState<"menu" | "profile" | "password" | "access">("menu");
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [isFetchingEvents, setIsFetchingEvents] = useState(false);
  const [isFetchingData, setIsFetchingData] = useState(false);
  
  const [selectedEventId, setSelectedEventId] = useState<string>("none");
  const [selectedSessionId, setSelectedSessionId] = useState<string>("none");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("none");
  const [selectedItemType, setSelectedItemType] = useState<"event" | "session" | "room">("event");
  const [selectedAccessLevel, setSelectedAccessLevel] = useState<string>("full");

  const [sidebarFormData, setSidebarFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    role: "",
    password: "",
    confirm_password: "",
  });

  const [newRole, setNewRole] = useState({
    name: "",
    description: "",
  });

  const [isCreatingRole, setIsCreatingRole] = useState(false);

  const fetchRBAC = async () => {
    const token = useAuthStore.getState().accessToken;
    if (!token) return;
    try {
      const [uRes, rRes, pRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/rbac/roles`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/rbac/permissions`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (uRes.ok) {
        const users = await uRes.json();
        const userList = Array.isArray(users) ? users : (users.data || []);
        setAllUsers(userList);
        
        // Real-time synchronization for the active editor
        if (selectedUserForEdit) {
          const freshUser = userList.find((u: any) => u.id === selectedUserForEdit.id);
          if (freshUser) setSelectedUserForEdit(freshUser);
        }
      }
      if (rRes.ok) {
        const rolesData = await rRes.json();
        setRoles(rolesData);
        if (!selectedRole && rolesData.length > 0) setSelectedRole(rolesData[0]);
      }
      if (pRes.ok) setPermissions(await pRes.json());
    } catch (e) {
      toast.error("Failed to sync RBAC state");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRBAC();
  }, []);

  useEffect(() => {
    if (selectedUserForEdit && isEditSidebarOpen) {
      fetchEvents();
      // Eagerly populate cache for existing assignments
      selectedUserForEdit.assignments?.forEach((as: any) => {
        if (as.event_id) fetchEventData(as.event_id);
      });
      
      setSidebarFormData({
        first_name: selectedUserForEdit.first_name || "",
        last_name: selectedUserForEdit.last_name || "",
        email: selectedUserForEdit.email || "",
        phone: selectedUserForEdit.phone || "",
        role: selectedUserForEdit.role || "",
        password: "",
        confirm_password: "",
      });
    } else {
      setSelectedEventId("none");
      setSelectedSessionId("none");
      setSelectedRoomId("none");
      setSelectedItemType("event");
      setSelectedAccessLevel("full");
    }
  }, [selectedUserForEdit, isEditSidebarOpen]);

  useEffect(() => {
    if (selectedRole) fetchRolePermissions(selectedRole.id);
  }, [selectedRole]);

  const fetchRolePermissions = async (roleId: string) => {
    const token = useAuthStore.getState().accessToken;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/rbac/roles/${roleId}/permissions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setRolePermissions(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchUsersByRole = async (roleName: string) => {
    setRoleUsers(allUsers.filter(u => u.role.toLowerCase().replace('_', ' ') === roleName.toLowerCase()));
  };

  const [entityNames, setEntityNames] = useState<Record<string, string>>({});
  
  const updateNameCache = (items: any[]) => {
    setEntityNames(prev => {
      const next = { ...prev };
      items.forEach(item => {
        if (item.id) {
          next[String(item.id)] = item.shortcode || item.title || item.name || item.id;
        }
      });
      return next;
    });
  };

  const fetchEvents = async () => {
    const token = useAuthStore.getState().accessToken;
    setIsFetchingEvents(true);
    toast.info("Syncing system registry...", { id: "rbac-event-sync" });
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/events`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const eventList = Array.isArray(data) ? data : (data.data || []);
        setEvents(eventList);
        updateNameCache(eventList);
        toast.success(`Synchronized ${eventList.length} events`, { id: "rbac-event-sync" });
      } else {
        toast.error("Security: Failed to fetch event registry", { id: "rbac-event-sync" });
      }
    } catch (e) {
      toast.error("Network Error: Failed to reach event service", { id: "rbac-event-sync" });
    } finally {
      setIsFetchingEvents(false);
    }
  };

  const fetchEventData = async (eventId: string) => {
    if (!eventId || eventId === "none") {
      setSessions([]);
      setRooms([]);
      return;
    }
    const token = useAuthStore.getState().accessToken;
    setIsFetchingData(true);
    // Clear previous data while fetching new ones
    setSessions([]);
    setRooms([]);
    try {
      const [sRes, rRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/events/${eventId}/sessions`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/events/${eventId}/rooms`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      
      if (sRes.ok) {
        const sData = await sRes.json();
        const sList = Array.isArray(sData) ? sData : (sData.data || []);
        setSessions(sList);
        updateNameCache(sList);
      }
      
      if (rRes.ok) {
        const rData = await rRes.json();
        const rList = Array.isArray(rData) ? rData : (rData.data || []);
        setRooms(rList);
        updateNameCache(rList);
      }
    } catch (e) {
      console.error("RBAC Sync Error (Event Details):", e);
    } finally {
      setIsFetchingData(false);
    }
  };

  useEffect(() => {
    if (selectedEventId !== "none") fetchEventData(selectedEventId);
  }, [selectedEventId]);

  const handleTogglePermission = async (permissionCode: string) => {
    if (!selectedRole) return;
    const token = useAuthStore.getState().accessToken;
    const isActive = rolePermissions.includes(permissionCode);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/rbac/roles/${selectedRole.id}/permissions`, {
        method: isActive ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ permission_code: permissionCode })
      });
      if (res.ok) {
        toast.success(isActive ? "Revoked capability" : "Authorized capability");
        fetchRolePermissions(selectedRole.id);
      }
    } catch (e) {
      toast.error("Operation failed");
    }
  };

  const handleAddRole = async () => {
    setIsCreatingRole(true);
    const token = useAuthStore.getState().accessToken;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/rbac/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newRole.name, description: newRole.description })
      });
      if (res.ok) {
        toast.success("New role initialized");
        setIsCreateRoleOpen(false);
        setNewRole({ name: "", description: "" });
        fetchRBAC();
      }
    } catch (e) {
      toast.error("Role creation failed");
    } finally {
      setIsCreatingRole(false);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    const token = useAuthStore.getState().accessToken;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/rbac/roles/${roleId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("Role deleted");
        fetchRBAC();
      }
    } catch (e) {
      toast.error("Deletion failed");
    }
  };

  const handleUpdateUser = async (userId: string, data: any) => {
    setSidebarLoading(true);
    const token = useAuthStore.getState().accessToken;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        toast.success("Profile updated");
        fetchRBAC();
      }
    } finally {
      setSidebarLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (sidebarFormData.password !== sidebarFormData.confirm_password) {
      toast.error("Passwords do not match");
      return;
    }
    setSidebarLoading(true);
    const token = useAuthStore.getState().accessToken;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/${selectedUserForEdit?.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ new_password: sidebarFormData.password })
      });
      if (res.ok) {
        toast.success("Security credentials updated");
        setSidebarView("menu");
      }
    } finally {
      setSidebarLoading(false);
    }
  };

  const superAdmins = allUsers.filter(u => u.role === "super_admin");
  const isSuperAdmin = selectedUserForEdit?.role === "super_admin";

  const handleToggleActive = async (user: UserDefinition) => {
    if (user.role === "super_admin" && superAdmins.length <= 1 && user.is_active) {
      toast.error("Security: Cannot deactivate the last remaining Super Admin.");
      return;
    }
    const token = useAuthStore.getState().accessToken;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_active: !user.is_active })
      });
      if (res.ok) {
        toast.success(user.is_active ? "Account deactivated" : "Account reactivated");
        fetchRBAC();
      }
    } catch (e) {
      toast.error("Action failed");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const user = allUsers.find(u => u.id === userId);
    if (user?.role === "super_admin" && superAdmins.length <= 1) {
      toast.error("Security: Cannot delete the last remaining Super Admin.");
      return;
    }
    const token = useAuthStore.getState().accessToken;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("Identity purged from system");
        setIsEditSidebarOpen(false);
        fetchRBAC();
      }
    } catch (e) {
      toast.error("Purge failed");
    }
  };

  const handleAddAssignment = async () => {
    if (!selectedUserForEdit || selectedEventId === "none") return;
    setSidebarLoading(true);
    const token = useAuthStore.getState().accessToken;
    try {
      const body: any = {
        user_id: selectedUserForEdit.id,
        event_id: selectedEventId,
        permissions: { 
          level: selectedAccessLevel, 
          node_type: selectedItemType 
        }
      };
      if (selectedItemType === "session") body.permissions.node_id = selectedSessionId;
      if (selectedItemType === "room") body.permissions.node_id = selectedRoomId;
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      
      if (res.ok) {
        toast.success("Access assigned");
        setSelectedEventId("none");
        setSelectedSessionId("none");
        setSelectedRoomId("none");
        await fetchRBAC();
      } else {
        const error = await res.json();
        toast.error(`Authorization Failed: ${error.detail || "Database rejected assignment"}`);
      }
    } catch (e) {
      toast.error("Network Error: Failed to reach security service");
    } finally {
      setSidebarLoading(false);
    }
  };

  const handleUpdateAssignment = async (assignmentId: string, level: string) => {
    const token = useAuthStore.getState().accessToken;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/assignments/${assignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ permissions: { level } })
      });
      if (res.ok) {
        toast.success("Access level modified");
        fetchRBAC();
      }
    } catch (e) {
      toast.error("Modification failed");
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    const token = useAuthStore.getState().accessToken;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/assignments/${assignmentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("Access revoked");
        fetchRBAC();
      }
    } catch (e) {
      toast.error("Revocation failed");
    }
  };

  const getModuleStatus = (moduleName: string) => {
    const modPerms = permissions.filter(p => p.module === moduleName).map(p => p.code);
    const active = modPerms.filter(p => rolePermissions.includes(p));
    if (active.length === 0) return { label: "No Access", type: "none" };
    if (active.length === modPerms.length) return { label: "Full Access", type: "full" };
    return { label: "Partial", type: "partial" };
  };

  if (loading) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <RefreshCw className="h-10 w-10 text-[var(--pri)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-12">
        <Tabs defaultValue="dashboard" className="w-full" onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-12">
            <TabsList className="bg-white/5 border border-default p-1 rounded-[2rem] h-16 w-fit">
              <TabsTrigger value="dashboard" className="rounded-3xl h-14 px-10">Dashboard</TabsTrigger>
              <TabsTrigger value="all-users" className="rounded-3xl h-14 px-10">All Users</TabsTrigger>
              <TabsTrigger value="roles" className="rounded-3xl h-14 px-10">Roles</TabsTrigger>
              <TabsTrigger value="responsibilities" className="rounded-3xl h-14 px-10">Capability Center</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-4">
              <Button onClick={() => setIsAddUserOpen(true)} variant="outline" className="border-default hover:bg-white/5 font-black uppercase tracking-widest text-[10px] rounded-2xl h-14 px-8 transition-all active:scale-95">
                <UserPlus className="mr-2 h-4 w-4 text-[var(--pri)]" /> Add New User
              </Button>
              <Dialog open={isCreateRoleOpen} onOpenChange={setIsCreateRoleOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl h-14 px-8 shadow-2xl shadow-[var(--pri)]/20 transition-all active:scale-95">
                    <PlusCircle className="mr-2 h-4 w-4" /> Add New Role
                  </Button>
                </DialogTrigger>
                <DialogContent className="glass-3d border-default max-w-lg p-0 overflow-hidden rounded-[3rem]">
                  <div className="p-10 space-y-8">
                    <DialogHeader>
                      <DialogTitle className="text-2xl font-black text-[var(--text)] tracking-tight">Create New Role</DialogTitle>
                      <DialogDescription className="text-[13px] font-medium text-muted mt-2">Define a new security category with custom base permissions.</DialogDescription>
                    </DialogHeader>
                    <div className="mt-8 space-y-6">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted px-1">Role Name</Label>
                        <Input placeholder="e.g. Content Manager" value={newRole.name} onChange={e => setNewRole({...newRole, name: e.target.value})} className="h-14 bg-white/5 border-default rounded-2xl font-bold" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted px-1">Description</Label>
                        <Input placeholder="Briefly describe what this role can do..." value={newRole.description} onChange={e => setNewRole({...newRole, description: e.target.value})} className="h-14 bg-white/5 border-default rounded-2xl font-bold" />
                      </div>
                    </div>
                    <DialogFooter className="mt-10 gap-3">
                      <Button onClick={handleAddRole} className="flex-1 h-14 bg-[var(--pri)] text-white font-black uppercase tracking-widest text-[11px] rounded-2xl">{isCreatingRole ? "Processing..." : "Create Category"}</Button>
                    </DialogFooter>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <TabsContent value="dashboard" className="m-0 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
              {[
                { 
                  label: "Total Registered Users", 
                  value: allUsers.length, 
                  icon: Users, 
                  color: "from-[var(--pri)] to-[var(--sec)]",
                  trend: "+12% from last month"
                },
                { 
                  label: "Platform Administrators", 
                  value: allUsers.filter(u => u.role === "super_admin" || u.role === "admin").length, 
                  icon: ShieldCheck, 
                  color: "from-amber-500 to-orange-600",
                  trend: "Security Tier 1"
                },
                { 
                  label: "Event Organizers", 
                  value: roles.find(r => r.name === "Event Organizer")?.users_count || 0, 
                  icon: Briefcase, 
                  color: "from-[var(--pri)] to-[var(--sec)]",
                  trend: "Active Teams"
                },
                { 
                  label: "System Health Status", 
                  value: "Optimum", 
                  icon: Activity, 
                  color: "from-emerald-500 to-teal-600",
                  trend: "All nodes operational"
                },
              ].map((stat, i) => (
                <Card key={i} className="relative bg-white/5 border-default rounded-[2.5rem] p-10 overflow-hidden group hover:bg-white/[0.08] transition-all duration-500">
                  <div className={cn("absolute top-0 right-0 w-32 h-32 bg-gradient-to-br opacity-5 group-hover:opacity-10 transition-opacity", stat.color)} />
                  <div className="flex items-center justify-between mb-8">
                    <div className={cn("h-16 w-16 rounded-[1.5rem] flex items-center justify-center text-white shadow-2xl bg-gradient-to-br", stat.color)}>
                      <stat.icon className="h-8 w-8" />
                    </div>
                    <Badge variant="outline" className="text-[9px] font-black uppercase tracking-tighter bg-white/5 border-none px-3 py-1">Live Monitor</Badge>
                  </div>
                  <h4 className="text-4xl font-black text-[var(--text)] tracking-tighter mb-2">{stat.value}</h4>
                  <p className="text-[13px] font-bold text-muted mb-6">{stat.label}</p>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted/60">{stat.trend}</span>
                  </div>
                </Card>
              ))}
            </div>

            {/* Quick Actions / Activity Feed Placeholder */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <Card className="lg:col-span-2 bg-white/5 border-default rounded-[2.5rem] p-10">
                <div className="flex items-center justify-between mb-10">
                  <h3 className="text-xl font-black tracking-tight">Recent Security Events</h3>
                  <Button variant="ghost" className="text-[11px] font-black uppercase tracking-widest text-muted hover:text-[var(--text)]">View Audit Log</Button>
                </div>
                <div className="space-y-6">
                  {[1, 2, 3].map((_, i) => (
                    <div key={i} className="flex items-center justify-between p-6 rounded-2xl bg-white/[0.02] border border-default/50">
                      <div className="flex items-center gap-5">
                        <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                          <ShieldAlert className="h-6 w-6 text-amber-500" />
                        </div>
                        <div>
                          <p className="text-[14px] font-bold">New Admin Role Assigned</p>
                          <p className="text-[12px] text-muted font-medium">Administrator profile modified by System Core</p>
                        </div>
                      </div>
                      <span className="text-[11px] font-bold text-muted">{i + 1}h ago</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="bg-gradient-to-br from-[var(--pri)] to-[var(--sec)] rounded-[2.5rem] p-10 text-white shadow-2xl">
                <div className="h-16 w-16 rounded-2xl bg-white/10 flex items-center justify-center mb-8">
                  <Lock className="h-8 w-8" />
                </div>
                <h3 className="text-2xl font-black tracking-tight mb-4">Security Advisory</h3>
                <p className="text-[14px] font-medium opacity-80 leading-relaxed mb-8">
                  Ensure all administrative accounts have 2FA enabled. The platform has detected 3 accounts without biometric verification.
                </p>
                <Button className="w-full h-14 bg-white text-[var(--pri)] font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-xl">Run Security Scan</Button>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="all-users" className="m-0 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-[var(--text)] tracking-tight">User Registry</h3>
                  <p className="text-[12px] text-muted font-medium mt-1">Total {allUsers.length} accounts verified on the network.</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted group-focus-within:text-[var(--pri)] transition-colors" />
                    <Input placeholder="Search by name, email or role..." className="h-14 w-[350px] bg-white/5 border-default rounded-2xl pl-12 font-bold focus:ring-2 ring-[var(--pri)]/20 shadow-xl" />
                  </div>
                </div>
              </div>

              <div className="bg-white/5 border border-default rounded-[3rem] overflow-hidden shadow-2xl">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-default bg-white/[0.02]">
                      <th className="text-left py-8 px-10 text-[10px] font-black text-muted uppercase tracking-widest">Identity Profile</th>
                      <th className="text-left py-8 px-10 text-[10px] font-black text-muted uppercase tracking-widest">Global Role</th>
                      <th className="text-center py-8 px-10 text-[10px] font-black text-muted uppercase tracking-widest">Security Status</th>
                      <th className="text-right py-8 px-10 text-[10px] font-black text-muted uppercase tracking-widest">Control Panel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allUsers.map(user => (
                      <tr key={user.id} className="border-b border-default/50 hover:bg-white/[0.03] transition-all group">
                        <td className="py-6 px-10">
                          <div className="flex items-center gap-5">
                            <Avatar className="h-14 w-14 border-2 border-default rounded-2xl shadow-inner group-hover:scale-105 transition-transform duration-500">
                              <AvatarImage src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`} />
                              <AvatarFallback className="font-black text-[var(--pri)] uppercase bg-white/5">{user.first_name?.[0]}{user.last_name?.[0]}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-[15px] font-black text-[var(--text)] tracking-tight">{user.first_name} {user.last_name}</p>
                              <p className="text-[12px] text-muted font-medium lowercase opacity-60">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-6 px-10">
                          <Badge variant="outline" className={cn(
                            "text-[10px] font-black uppercase px-4 py-1.5 rounded-xl border-none shadow-sm",
                            user.role.includes('admin') ? "bg-amber-500/10 text-amber-500" : "bg-[var(--pri)]/10 text-[var(--pri)]"
                          )}>
                            {user.role.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="py-6 px-10 text-center">
                          <div className="flex justify-center items-center gap-2">
                            <div className={cn("h-2.5 w-2.5 rounded-full animate-pulse", user.is_active ? "bg-emerald-500" : "bg-rose-500")} />
                            <span className={cn("text-[11px] font-black uppercase tracking-widest", user.is_active ? "text-emerald-500" : "text-rose-500")}>
                              {user.is_active ? "Verified" : "Suspended"}
                            </span>
                          </div>
                        </td>
                        <td className="py-6 px-10 text-right">
                          <Button variant="outline" onClick={() => { setSelectedUserForEdit(user); setIsEditSidebarOpen(true); setSidebarView("menu"); }} className="h-11 px-6 rounded-xl border-default hover:bg-[var(--pri)]/10 hover:text-[var(--pri)] hover:border-[var(--pri)]/50 transition-all font-black text-[11px] uppercase tracking-widest active:scale-95">
                            Manage User
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="roles" className="m-0 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-[var(--text)] tracking-tight">Security Tiers</h3>
                  <p className="text-[12px] text-muted font-medium mt-1">Hierarchical control system based on priority and scope.</p>
                </div>
              </div>
              <div className="bg-white/5 border border-default rounded-[3rem] overflow-hidden shadow-2xl">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-default bg-white/[0.02]">
                      <th className="text-left py-8 px-10 text-[10px] font-black text-muted uppercase tracking-widest">Role Template</th>
                      <th className="text-left py-8 px-10 text-[10px] font-black text-muted uppercase tracking-widest">Priority Scope</th>
                      <th className="text-center py-8 px-10 text-[10px] font-black text-muted uppercase tracking-widest">Headcount</th>
                      <th className="text-right py-8 px-10 text-[10px] font-black text-muted uppercase tracking-widest">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRoles.map(role => (
                      <tr key={role.id} className="border-b border-default/50 hover:bg-white/[0.03] transition-all group">
                        <td className="py-6 px-10">
                          <div className="flex items-center gap-5">
                            <div className="h-14 w-14 rounded-2xl bg-white/5 flex items-center justify-center border-2 border-default group-hover:border-[var(--pri)]/30 transition-colors">
                              <Shield className={cn("h-7 w-7", role.is_system_role ? "text-amber-500" : "text-muted")} />
                            </div>
                            <div>
                              <p className="text-[15px] font-black text-[var(--text)] tracking-tight">{role.name}</p>
                              <p className="text-[12px] text-muted font-medium line-clamp-1 max-w-[400px] opacity-60">{role.description}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-6 px-10">
                          <div className="flex items-center gap-3">
                            <div className="h-2 w-2 rounded-full bg-[var(--pri)]" />
                            <span className="text-[13px] font-bold text-muted uppercase tracking-tighter">{role.scope}</span>
                          </div>
                        </td>
                        <td className="py-6 px-10 text-center">
                          <div className="inline-flex items-center justify-center px-4 py-2 rounded-2xl bg-white/5 border border-default min-w-[100px]">
                            <Users className="h-3.5 w-3.5 mr-2 text-[var(--pri)]" />
                            <span className="text-[14px] font-black text-[var(--text)]">{role.users_count}</span>
                          </div>
                        </td>
                        <td className="py-6 px-10 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <Button variant="ghost" size="sm" onClick={() => { setSelectedRoleForUsers(role); fetchUsersByRole(role.name); setIsUserListOpen(true); }} className="h-11 px-6 rounded-xl hover:bg-white/5 text-[11px] font-black uppercase tracking-widest text-muted hover:text-[var(--text)] transition-all">
                              Inspect Users
                            </Button>
                            {!role.is_system_role && (
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteRole(role.id)} className="h-11 w-11 rounded-xl text-rose-500 hover:bg-rose-500/10 transition-all border border-transparent hover:border-rose-500/20">
                                <Trash2 className="h-5 w-5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="responsibilities" className="m-0 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="space-y-12">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-[var(--text)] tracking-tight">Capability Center</h3>
                  <p className="text-[12px] text-muted font-medium mt-1">Manage granular permissions for the **{selectedRole?.name}** role.</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[11px] font-black text-muted uppercase tracking-widest">Switch Active Role</span>
                  <Select value={selectedRole?.name} onValueChange={val => setSelectedRole(roles.find(r => r.name === val) || null)}>
                    <SelectTrigger className="h-14 w-[240px] bg-white/5 border-default rounded-2xl font-black px-6 shadow-xl"><SelectValue /></SelectTrigger>
                    <SelectContent className="glass-3d border-default rounded-2xl">
                      {roles.map(r => <SelectItem key={r.id} value={r.name} className="font-bold py-3">{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {Array.from(new Set(permissions.map(p => p.module))).map(modName => {
                  const meta = MODULE_METADATA[modName] || { name: modName, description: "Module capabilities", icon: Shield };
                  const status = getModuleStatus(modName);
                  return (
                    <Card key={modName} onClick={() => { setSelectedModuleForMatrix(modName); setIsMatrixDialogOpen(true); }} className="group relative bg-white/5 border-default rounded-[2.5rem] p-8 hover:bg-white/[0.08] transition-all cursor-pointer overflow-hidden shadow-xl hover:shadow-2xl hover:translate-y-[-4px]">
                      <div className="flex items-center justify-between mb-6">
                        <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center border-2 border-default shadow-inner", status.type === 'full' ? 'bg-emerald-500/10 text-emerald-400' : status.type === 'partial' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400')}>
                          <meta.icon className="h-7 w-7" />
                        </div>
                        <Badge variant="outline" className={cn("text-[8px] font-black uppercase px-3 py-1 rounded-lg border-none shadow-sm", status.type === 'full' ? 'bg-emerald-500/10 text-emerald-400' : status.type === 'partial' ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-muted')}>
                          {status.label}
                        </Badge>
                      </div>
                      <h4 className="text-lg font-black text-[var(--text)] tracking-tight mb-2 group-hover:text-[var(--pri)] transition-colors">{meta.name}</h4>
                      <p className="text-[12px] text-muted font-medium line-clamp-2 leading-relaxed">{meta.description}</p>
                      <div className="mt-8 pt-6 border-t border-default flex items-center justify-between">
                        <span className="text-[10px] font-black text-muted uppercase tracking-widest">Configure</span>
                        <div className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-[var(--pri)] group-hover:text-white transition-all"><ChevronRight className="h-4 w-4" /></div>
                      </div>
                    </Card>
                  );
                })}
              </div>

              <Dialog open={isMatrixDialogOpen} onOpenChange={setIsMatrixDialogOpen}>
                <DialogContent className="glass-3d border-default rounded-[3rem] p-0 overflow-hidden max-w-4xl">
                  <div className="p-12 space-y-10">
                    <DialogHeader>
                      <div className="flex items-center gap-8">
                        <div className={cn("h-20 w-20 rounded-[2rem] flex items-center justify-center shadow-inner", selectedModuleForMatrix && getModuleStatus(selectedModuleForMatrix).type === 'full' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-[var(--pri)]/10 text-[var(--pri)]')}>
                          {selectedModuleForMatrix && MODULE_METADATA[selectedModuleForMatrix]?.icon && React.createElement(MODULE_METADATA[selectedModuleForMatrix].icon, { className: "h-10 w-10" })}
                        </div>
                        <div className="space-y-1 text-left">
                          <DialogTitle className="text-3xl font-black tracking-tighter text-[var(--text)]">{selectedModuleForMatrix && MODULE_METADATA[selectedModuleForMatrix]?.name} <span className="text-muted">Matrix</span></DialogTitle>
                          <DialogDescription className="text-[14px] font-medium text-muted">Configure granular permissions for the **{selectedRole?.name}** role.</DialogDescription>
                        </div>
                      </div>
                    </DialogHeader>
                    <div className="bg-white/5 border border-default rounded-[2.5rem] overflow-hidden">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-default bg-white/[0.02]">
                            <th className="text-left py-6 px-10 text-[10px] font-black text-muted uppercase tracking-widest">Capability</th>
                            <th className="text-center py-6 px-10 text-[10px] font-black text-muted uppercase tracking-widest">Status</th>
                            <th className="text-right py-6 px-10 text-[10px] font-black text-muted uppercase tracking-widest">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "OVERRIDE", "EXPORT"].map(act => {
                            const pCode = `${selectedModuleForMatrix}:${act}`;
                            const hasPerm = rolePermissions.includes(pCode);
                            const exists = permissions.some(p => p.code === pCode);
                            if (!exists) return null;
                            return (
                              <tr key={act} className="border-b border-default/50 hover:bg-white/[0.02] transition-colors group">
                                <td className="py-6 px-10">
                                  <div>
                                    <p className="text-[14px] font-black text-[var(--text)] uppercase tracking-tight">{act}</p>
                                    <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Granular Control</p>
                                  </div>
                                </td>
                                <td className="py-6 px-10 text-center">
                                  <Badge className={cn("rounded-lg font-black text-[9px] uppercase px-3 py-1 border-none", hasPerm ? "bg-emerald-500/10 text-emerald-500" : "bg-white/5 text-muted/40")}>{hasPerm ? "Authorized" : "Locked"}</Badge>
                                </td>
                                <td className="py-6 px-10 text-right">
                                  <Switch checked={hasPerm} onCheckedChange={() => handleTogglePermission(pCode)} className="scale-110" />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="pt-6 border-t border-default">
                      <Button onClick={() => setIsMatrixDialogOpen(false)} className="w-full h-16 bg-[var(--pri)] text-white rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-xl shadow-[var(--pri)]/20">Finish Configuration</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="flex flex-wrap items-center justify-between gap-8 px-8 py-10 bg-white/5 border border-default rounded-[2.5rem]">
                <div className="flex gap-10">
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-4 rounded-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]" />
                    <span className="text-[11px] font-black text-muted uppercase tracking-widest">Full Access</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-4 rounded-full bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]" />
                    <span className="text-[11px] font-black text-muted uppercase tracking-widest">Restricted</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-4 rounded-full bg-white/10" />
                    <span className="text-[11px] font-black text-muted uppercase tracking-widest">No Access</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-muted">
                  <Info className="h-4 w-4" />
                  <p className="text-[11px] font-medium tracking-tight">Configuration changes are enforced in real-time across the platform.</p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="p-8 rounded-[2.5rem] bg-[var(--pri)]/5 border border-[var(--pri)]/20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-[var(--pri)]/10 flex items-center justify-center"><Info className="h-5 w-5 text-[var(--pri)]" /></div>
            <p className="text-[12px] text-muted font-medium">Changes to roles, responsibilities and access are logged for security and audit purposes.</p>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-black text-muted uppercase tracking-widest block mb-1">Last Sync</span>
            <span className="text-[12px] font-bold text-[var(--text)]">{new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })} IST</span>
          </div>
        </div>

        <Dialog open={isUserListOpen} onOpenChange={setIsUserListOpen}>
          <DialogContent className="glass-3d border-default max-w-4xl p-0 overflow-hidden rounded-[3rem]">
            <div className="p-10 border-b border-default bg-white/[0.02]">
              <DialogHeader>
                <div className="flex items-center gap-5 mb-4">
                  <div className="h-14 w-14 rounded-2xl bg-[var(--pri)]/10 flex items-center justify-center"><Users className="h-7 w-7 text-[var(--pri)]" /></div>
                  <div>
                    <DialogTitle className="text-3xl font-black text-[var(--text)] tracking-tight">{selectedRoleForUsers?.name} <span className="text-muted">Users</span></DialogTitle>
                    <DialogDescription className="text-[13px] font-medium text-muted mt-1">{selectedRoleForUsers?.users_count} accounts assigned to this category.</DialogDescription>
                  </div>
                </div>
              </DialogHeader>
            </div>
            <ScrollArea className="h-[500px]">
              <div className="p-6">
                {roleUsers.length === 0 ? (
                  <div className="h-60 flex flex-col items-center justify-center text-center">
                    <UserPlus className="h-10 w-10 text-muted/20 mb-4" />
                    <p className="text-[13px] font-bold text-muted uppercase tracking-widest">No users found in this role</p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {roleUsers.map(u => (
                      <div key={u.id} className="p-6 rounded-[2rem] border border-default bg-white/5 flex items-center justify-between group hover:bg-white/[0.08] transition-all">
                        <div className="flex items-center gap-5">
                          <Avatar className="h-14 w-14 border-2 border-default rounded-2xl">
                            <AvatarImage src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.email}`} />
                            <AvatarFallback className="font-black text-[var(--pri)]">{u.first_name?.[0]}{u.last_name?.[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-[15px] font-black text-[var(--text)]">{u.first_name} {u.last_name}</p>
                            <p className="text-[12px] font-medium text-muted lowercase">{u.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => { setSelectedUserForEdit(u); setIsEditSidebarOpen(true); setSidebarView("access"); }} className="h-11 px-6 rounded-xl bg-[var(--pri)]/10 text-[var(--pri)] text-[11px] font-black uppercase tracking-widest hover:bg-[var(--pri)] hover:text-white transition-all flex items-center gap-2">
                            <Calendar className="h-4 w-4" /> Event Assigned
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
            <div className="p-8 border-t border-default bg-white/[0.02] flex justify-end">
              <Button onClick={() => setIsUserListOpen(false)} className="h-12 px-8 rounded-xl bg-white/10 text-[11px] font-black uppercase tracking-widest hover:bg-white/20 transition-all">Close View</Button>
            </div>
          </DialogContent>
        </Dialog>

        <CreateUserDialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen} roles={roles} onSuccess={() => { setIsAddUserOpen(false); fetchRBAC(); toast.success("User onboarded"); }} />

        <AnimatePresence>
          {isEditSidebarOpen && selectedUserForEdit && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsEditSidebarOpen(false)} className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100]" />
              <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }} className="fixed right-0 top-0 h-full w-[600px] bg-[#0A0A0B] border-l border-default z-[101] shadow-2xl overflow-hidden flex flex-col">
                <div className="flex-1 p-10 overflow-y-auto">
                  <div className="flex items-center justify-between mb-12">
                    <div className="flex items-center gap-3">
                      {sidebarView !== "menu" && <button onClick={() => setSidebarView("menu")} className="h-10 w-10 rounded-full hover:bg-white/5 flex items-center justify-center transition-all border border-default"><ChevronRight className="h-5 w-5 rotate-180" /></button>}
                      <h2 className="text-2xl font-black tracking-tight">{sidebarView === "menu" ? "Edit User" : sidebarView === "profile" ? "Profile" : sidebarView === "password" ? "Security" : "Access"}</h2>
                    </div>
                    <button onClick={() => setIsEditSidebarOpen(false)} className="h-10 w-10 rounded-full hover:bg-white/5 flex items-center justify-center transition-all"><X className="h-5 w-5" /></button>
                  </div>
                  {/* Sidebar content logic here (same as before but simplified to avoid nesting errors) */}
                  <div className="flex flex-col items-center mb-12">
                    <Avatar className="h-24 w-24 border-4 border-default rounded-3xl mb-4">
                      <AvatarImage src={selectedUserForEdit.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedUserForEdit.email}`} />
                      <AvatarFallback className="text-3xl font-black text-[var(--pri)]">{selectedUserForEdit.first_name?.[0]}{selectedUserForEdit.last_name?.[0]}</AvatarFallback>
                    </Avatar>
                    <h3 className="text-xl font-black">{selectedUserForEdit.first_name} {selectedUserForEdit.last_name}</h3>
                    <p className="text-[13px] font-medium text-muted lowercase">{selectedUserForEdit.email}</p>
                  </div>
                  
                  {sidebarView === "menu" && (
                    <div className="space-y-4 animate-in slide-in-from-right-4">
                      <Button onClick={() => setSidebarView("profile")} variant="outline" className="w-full h-14 justify-start px-6 rounded-2xl border-default hover:bg-white/5 font-bold"><User className="mr-3 h-4 w-4" /> Edit Profile</Button>
                      <Button onClick={() => setSidebarView("password")} variant="outline" className="w-full h-14 justify-start px-6 rounded-2xl border-default hover:bg-white/5 font-bold text-amber-500"><KeyRound className="mr-3 h-4 w-4" /> Security Settings</Button>
                      <Button 
                        onClick={() => { fetchEvents(); setSidebarView("access"); }} 
                        disabled={isSuperAdmin}
                        variant="outline" 
                        className={cn(
                          "w-full h-14 justify-start px-6 rounded-2xl border-default font-bold transition-all",
                          isSuperAdmin ? "opacity-50 grayscale cursor-not-allowed" : "hover:bg-white/5 text-[var(--pri)]"
                        )}
                      >
                        <Calendar className="mr-3 h-4 w-4" /> 
                        {isSuperAdmin ? "Global Access Enabled" : "Managed Access"}
                      </Button>
                      
                      <Button 
                        onClick={() => handleToggleActive(selectedUserForEdit)} 
                        variant="outline" 
                        className={cn(
                          "w-full h-14 justify-start px-6 rounded-2xl border-red-500/20 font-bold",
                          isSuperAdmin && superAdmins.length <= 1 && selectedUserForEdit.is_active ? "opacity-50 cursor-not-allowed" : "hover:bg-red-500/10 text-red-500"
                        )}
                      >
                        <Power className="mr-3 h-4 w-4" /> 
                        {selectedUserForEdit.is_active ? "Suspend Account" : "Activate Account"}
                      </Button>

                      <Button 
                        onClick={() => handleDeleteUser(selectedUserForEdit.id)} 
                        variant="outline" 
                        className={cn(
                          "w-full h-14 justify-start px-6 rounded-2xl border-red-500/40 font-bold",
                          isSuperAdmin && superAdmins.length <= 1 ? "opacity-50 cursor-not-allowed" : "hover:bg-red-500/20 text-red-600"
                        )}
                      >
                        <Trash2 className="mr-3 h-4 w-4" /> 
                        Delete Account
                      </Button>
                    </div>
                  )}

                  {sidebarView === "profile" && (
                    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted">First Name</Label>
                          <Input value={sidebarFormData.first_name} onChange={e => setSidebarFormData({...sidebarFormData, first_name: e.target.value})} className="h-14 bg-white/5 border-default rounded-2xl px-6 font-bold" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted">Last Name</Label>
                          <Input value={sidebarFormData.last_name} onChange={e => setSidebarFormData({...sidebarFormData, last_name: e.target.value})} className="h-14 bg-white/5 border-default rounded-2xl px-6 font-bold" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted">Email Address</Label>
                        <Input value={sidebarFormData.email} onChange={e => setSidebarFormData({...sidebarFormData, email: e.target.value})} className="h-14 bg-white/5 border-default rounded-2xl px-6 font-bold" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted">Phone Number</Label>
                        <Input value={sidebarFormData.phone} onChange={e => setSidebarFormData({...sidebarFormData, phone: e.target.value})} className="h-14 bg-white/5 border-default rounded-2xl px-6 font-bold" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted">Global Role</Label>
                        <Select 
                          value={sidebarFormData.role} 
                          onValueChange={(val: string) => setSidebarFormData({...sidebarFormData, role: val})}
                          disabled={currentUser?.role !== 'super_admin' && (selectedUserForEdit?.role === 'super_admin' || selectedUserForEdit?.role === 'organiser')}
                        >
                          <SelectTrigger className="h-14 bg-white/5 border-default rounded-2xl px-6 font-bold">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="glass-3d border-default rounded-2xl">
                            {currentUser?.role === 'super_admin' && (
                              <>
                                <SelectItem 
                                  value="super_admin" 
                                  className="font-bold py-3 text-red-500"
                                  disabled={((roles?.find(r => r.name === 'Super Admin')?.users_count) ?? 0) >= 3 && selectedUserForEdit?.role !== 'super_admin'}
                                >
                                  Super Admin {((roles?.find(r => r.name === 'Super Admin')?.users_count) ?? 0) >= 3 && selectedUserForEdit?.role !== 'super_admin' && "(Limit Reached)"}
                                </SelectItem>
                                <SelectItem value="organiser" className="font-bold py-3 text-[var(--pri)]">Organiser</SelectItem>
                              </>
                            )}
                            <SelectItem value="admin" className="font-bold py-3">Admin</SelectItem>
                            <SelectItem value="registration_manager" className="font-bold py-3">Registration Manager</SelectItem>
                            <SelectItem value="registration_coordinator" className="font-bold py-3">Registration Coordinator</SelectItem>
                            <SelectItem value="registration_reviewer" className="font-bold py-3">Registration Reviewer</SelectItem>
                            <SelectItem value="badge_manager" className="font-bold py-3">Badge Manager</SelectItem>
                            <SelectItem value="checkin_staff" className="font-bold py-3">Check-in Staff</SelectItem>
                            <SelectItem value="registration_viewer" className="font-bold py-3">Registration Viewer</SelectItem>
                            <SelectItem value="speaker_manager" className="font-bold py-3">Speaker Manager</SelectItem>
                            <SelectItem value="session_manager" className="font-bold py-3">Session Manager</SelectItem>
                            <SelectItem value="room_manager" className="font-bold py-3">Room Manager</SelectItem>
                            <SelectItem value="venue_operator" className="font-bold py-3">Venue Operator</SelectItem>
                            <SelectItem value="technician" className="font-bold py-3">Technician</SelectItem>
                            <SelectItem value="volunteer" className="font-bold py-3">Volunteer</SelectItem>
                            <SelectItem value="viewer" className="font-bold py-3">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={() => handleUpdateUser(selectedUserForEdit.id, sidebarFormData)} disabled={sidebarLoading} className="w-full h-14 bg-[var(--pri)] text-white font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-xl">{sidebarLoading ? "Saving..." : "Save Changes"}</Button>
                    </div>
                  )}

                  {sidebarView === "password" && (
                    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted">New Password</Label>
                        <Input type="password" value={sidebarFormData.password} onChange={e => setSidebarFormData({...sidebarFormData, password: e.target.value})} className="h-14 bg-white/5 border-default rounded-2xl px-6 font-bold" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted">Confirm Password</Label>
                        <Input type="password" value={sidebarFormData.confirm_password} onChange={e => setSidebarFormData({...sidebarFormData, confirm_password: e.target.value})} className="h-14 bg-white/5 border-default rounded-2xl px-6 font-bold" />
                      </div>
                      <Button onClick={handleResetPassword} disabled={sidebarLoading} className="w-full h-14 bg-amber-500 text-white font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-xl shadow-amber-500/20">{sidebarLoading ? "Resetting..." : "Confirm Security Update"}</Button>
                    </div>
                  )}

                  {sidebarView === "access" && (
                    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                      <div className="bg-white/5 border border-default rounded-[2rem] p-8 space-y-6 shadow-inner">
                        <div className="space-y-4">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted">1. Target Scope</Label>
                          <Select value={selectedItemType} onValueChange={(val: any) => setSelectedItemType(val)}>
                            <SelectTrigger className="h-14 bg-white/5 border-default rounded-2xl px-6 font-bold"><SelectValue placeholder="Select Scope" /></SelectTrigger>
                            <SelectContent className="glass-3d border-default rounded-2xl">
                              <SelectItem value="event" className="font-bold py-3">Event-Wide Access</SelectItem>
                              <SelectItem value="session" className="font-bold py-3">Session-Specific</SelectItem>
                              <SelectItem value="room" className="font-bold py-3">Room Management</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-4">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted">2. Select Event</Label>
                          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                            <SelectTrigger className="h-14 bg-white/5 border-default rounded-2xl px-6 font-bold">
                              {isFetchingEvents ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                              <SelectValue placeholder="Select Event Context" />
                            </SelectTrigger>
                            <SelectContent className="glass-3d border-default rounded-2xl">
                              {events.length > 0 ? (
                                events.map(ev => <SelectItem key={ev.id} value={String(ev.id)} className="font-bold py-3">{ev.title || ev.name || `Event ${ev.id}`}</SelectItem>)
                              ) : (
                                <SelectItem value="none" disabled className="font-bold py-3">No events found</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-4">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted">3. Authority Tier</Label>
                          <Select value={selectedAccessLevel} onValueChange={setSelectedAccessLevel}>
                            <SelectTrigger className="h-14 bg-white/5 border-default rounded-2xl px-6 font-bold">
                              <SelectValue placeholder="Select Level" />
                            </SelectTrigger>
                            <SelectContent className="glass-3d border-default rounded-2xl">
                              <SelectItem value="full" className="font-bold py-3">Full Access</SelectItem>
                              <SelectItem value="partial" className="font-bold py-3">Partial Access</SelectItem>
                              <SelectItem value="reviewer" className="font-bold py-3">Reviewer Only</SelectItem>
                              <SelectItem value="manager" className="font-bold py-3">Manager Tier</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {selectedItemType === "session" && selectedEventId !== "none" && (
                          <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted">4. Select Session</Label>
                            <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
                              <SelectTrigger className="h-14 bg-white/5 border-default rounded-2xl px-6 font-bold">
                                {isFetchingData ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                                <SelectValue placeholder="Target Session" />
                              </SelectTrigger>
                              <SelectContent className="glass-3d border-default rounded-2xl">
                                {sessions.length > 0 ? (
                                  sessions.map(s => <SelectItem key={s.id} value={String(s.id)} className="font-bold py-3">{s.title || s.name || `Session ${s.id}`}</SelectItem>)
                                ) : (
                                  <SelectItem value="none" disabled className="font-bold py-3">No sessions found</SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {selectedItemType === "room" && selectedEventId !== "none" && (
                          <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted">4. Select Room</Label>
                            <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                              <SelectTrigger className="h-14 bg-white/5 border-default rounded-2xl px-6 font-bold">
                                {isFetchingData ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                                <SelectValue placeholder="Target Room" />
                              </SelectTrigger>
                              <SelectContent className="glass-3d border-default rounded-2xl">
                                {rooms.length > 0 ? (
                                  rooms.map(r => <SelectItem key={r.id} value={String(r.id)} className="font-bold py-3">{r.name || r.title || `Room ${r.id}`}</SelectItem>)
                                ) : (
                                  <SelectItem value="none" disabled className="font-bold py-3">No rooms found</SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        <Button 
                          onClick={handleAddAssignment} 
                          disabled={
                            sidebarLoading || 
                            selectedEventId === "none" || 
                            (selectedItemType === "session" && selectedSessionId === "none") ||
                            (selectedItemType === "room" && selectedRoomId === "none")
                          } 
                          className="w-full h-14 bg-[var(--pri)] text-white rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-2xl shadow-[var(--pri)]/30 group"
                        >
                          <PlusCircle className="h-4 w-4 mr-2 group-hover:rotate-90 transition-transform" />
                          {sidebarLoading ? "Authorizing..." : "Grant Access Level"}
                        </Button>
                      </div>

                      <div className="space-y-4">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted">Active Assignments</Label>
                        <div className="space-y-3">
                          {selectedUserForEdit.assignments?.length ? selectedUserForEdit.assignments.map((as: any) => (
                            <div key={as.id} className="p-5 rounded-2xl bg-white/5 border border-default flex items-center justify-between group">
                              <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-lg bg-[var(--pri)]/10 flex items-center justify-center"><Calendar className="h-5 w-5 text-[var(--pri)]" /></div>
                                <div>
                                  <p className="text-[13px] font-black">
                                    {as.permissions?.node_type === "session" 
                                      ? (entityNames[String(as.permissions.node_id)] || as.session?.title || `Session ${String(as.permissions.node_id).slice(0, 8)}`)
                                      : as.permissions?.node_type === "room"
                                      ? (entityNames[String(as.permissions.node_id)] || as.room?.name || `Room ${String(as.permissions.node_id).slice(0, 8)}`)
                                      : (as.event?.title || as.event?.name || "Global Event")}
                                  </p>
                                  <p className="text-[10px] font-bold text-muted uppercase tracking-widest">
                                    {entityNames[String(as.event_id)] || as.event?.shortcode || as.event?.title || as.event?.name || `Event ${String(as.event_id).slice(0, 8)}`} | {as.permissions?.node_type?.toUpperCase() || "EVENT"} | {as.permissions?.level || "Reviewer"}
                                  </p>
                                </div>
                              </div>
                              <button onClick={() => handleRemoveAssignment(as.id)} className="h-10 w-10 rounded-lg flex items-center justify-center text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/10"><X className="h-4 w-4" /></button>
                            </div>
                          )) : (
                            <div className="p-8 border border-dashed border-default rounded-2xl text-center"><p className="text-[11px] font-bold text-muted uppercase tracking-widest">No active event access</p></div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-10 border-t border-default"><Button onClick={() => setIsEditSidebarOpen(false)} className="w-full h-14 bg-white/5 hover:bg-white/10 rounded-2xl font-black uppercase tracking-widest text-[11px]">Dismiss</Button></div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
