"use client";

import { UserManagement } from "@/components/organizer/rbac/UserManagement";
import { PageHeader } from "@/components/organizer/layout/PageHeader";
import { Users } from "lucide-react";
import { PermissionGate } from "@/components/organizer/auth/PermissionGate";
import { PERMISSIONS } from "@/lib/permissions";

export default function UsersPage() {
  return (
    <div className="space-y-10 max-w-[1600px] mx-auto pb-20 animate-fade-in">
      <div className="px-2">
        <PageHeader 
          title="Security & Access Control" 
          description="Manage roles, granular permissions, and user category assignments across the platform."
        />
      </div>
      
      <PermissionGate 
        permission={PERMISSIONS.USERS_VIEW}
        fallback={
          <div className="flex flex-col items-center justify-center p-20 text-center opacity-50 space-y-4">
            <div className="h-16 w-16 rounded-full bg-rose-500/10 flex items-center justify-center"><Users className="h-8 w-8 text-rose-500" /></div>
            <p className="text-xl font-black uppercase tracking-widest">Access Denied</p>
            <p className="text-sm font-bold text-muted">You do not have permission to manage users.</p>
          </div>
        }
      >
        <UserManagement />
      </PermissionGate>
    </div>
  );
}
