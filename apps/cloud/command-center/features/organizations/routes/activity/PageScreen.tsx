"use client";

import { useParams } from "next/navigation";
import { useState, useMemo } from "react";
import { Activity, User, Layers, Calendar } from "lucide-react";
import { useOrganizationDomain } from "@/features/organizations/api/organization-console-api";
import {
  OrgPageHeader, OrgCard, OrgSectionTitle, 
  UnavailableDomain, LoadingPage, OrgMetricCard
} from "@/features/organizations/components/OrgPageShared";

export default function ActivityPageScreen() {
  const params = useParams<{ orgId: string }>();
  const { data, isLoading } = useOrganizationDomain(params.orgId, "activity");

  const [moduleFilter, setModuleFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");

  if (isLoading) return <LoadingPage />;
  if (!data?.availability?.available) return <UnavailableDomain reason={data?.availability?.reason} />;

  const domainData = data?.data as any;
  const activities: any[] = domainData?.items ?? domainData?.activities ?? [];

  const modules = Array.from(new Set(activities.map(a => a.resource_type || a.module_name))).filter(Boolean);
  const users = Array.from(new Set(activities.map(a => a.actor_user_id || a.actor_name || a.actor_email))).filter(Boolean);

  const filteredActivities = activities.filter((a) => {
    const mod = a.resource_type || a.module_name;
    const usr = a.actor_user_id || a.actor_name || a.actor_email;
    const matchModule = !moduleFilter || mod === moduleFilter;
    const matchUser = !userFilter || usr === userFilter;
    return matchModule && matchUser;
  });

  const recentModules = useMemo(() => {
    const counts = activities.reduce((acc, a) => {
      const mod = a.resource_type || a.module_name || "System";
      acc[mod] = (acc[mod] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [activities]);

  return (
    <div className="p-6 space-y-6">
      <OrgPageHeader
        icon={Activity}
        title="Activity Timeline"
        description="A chronologically ordered view of recent operations across the organization."
        generatedAt={data?.generated_at}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Col: Timeline */}
        <div className="lg:col-span-3 space-y-4">
           {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-6 bg-[var(--bg-surface-3)] p-3 rounded-xl border border-[var(--border-default)]">
            <div className="flex items-center gap-2">
               <Layers className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
               <select
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="bg-transparent text-xs text-[var(--text-secondary)] focus:outline-none cursor-pointer"
              >
                <option value="">All Resource Types</option>
                {modules.map(m => <option key={m as string} value={m as string}>{m as string}</option>)}
              </select>
            </div>
            <div className="w-px h-4 bg-[var(--border-default)] my-auto" />
            <div className="flex items-center gap-2">
               <User className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
               <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="bg-transparent text-xs text-[var(--text-secondary)] focus:outline-none cursor-pointer max-w-[150px]"
              >
                <option value="">All Actors</option>
                {users.map(u => <option key={u as string} value={u as string}>{u as string}</option>)}
              </select>
            </div>
          </div>

          <div className="relative pl-6">
            {/* Vertical Line */}
            <div className="absolute left-[11px] top-2 bottom-0 w-px bg-[var(--border-subtle)]" />
            
            <div className="space-y-6">
              {filteredActivities.length === 0 ? (
                 <p className="text-xs text-[var(--text-tertiary)] py-4">No activities match the current filters.</p>
              ) : (
                filteredActivities.map((act) => (
                  <div key={act.id} className="relative">
                    <div className="absolute -left-[30px] top-1 w-6 h-6 rounded-full bg-[var(--bg-surface-3)] border border-[var(--border-default)] flex items-center justify-center shadow-sm">
                      <div className="w-2 h-2 rounded-full bg-[var(--brand-primary)]" />
                    </div>
                    
                    <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-4 shadow-sm">
                      <div className="flex justify-between items-start mb-2 gap-4">
                        <p className="text-sm font-bold text-[var(--text-primary)]">
                           {act.action_type || act.action || "Operation executed"}
                        </p>
                        <span className="text-[10px] font-mono text-[var(--text-tertiary)] shrink-0 mt-1">
                          {act.occurred_at ? new Date(act.occurred_at).toLocaleString() : "—"}
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-[var(--border-subtle)]">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-[var(--brand-primary)]/10 flex items-center justify-center text-[8px] font-black text-[var(--brand-primary)] uppercase">
                            {(act.actor_name || act.actor_email || act.actor_user_id || "S")?.[0]}
                          </div>
                          <span className="text-xs text-[var(--text-secondary)] font-mono">
                            {act.actor_name || act.actor_email || (act.actor_user_id ? act.actor_user_id.slice(0, 14) : "System")}
                          </span>
                        </div>
                        {(act.resource_type || act.module_name) && (
                           <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--bg-surface-3)] border border-[var(--border-subtle)]">
                              <Layers className="w-3 h-3 text-[var(--text-tertiary)]" />
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                                {act.resource_type || act.module_name}
                              </span>
                           </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Col: Summaries */}
        <div className="space-y-4">
          <OrgMetricCard label="Total Operations" value={activities.length} />
          
          <OrgCard>
            <OrgSectionTitle>Top Resources</OrgSectionTitle>
            <div className="space-y-3 mt-2">
              {recentModules.map(m => (
                 <div key={m.name} className="flex items-center justify-between">
                    <span className="text-xs text-[var(--text-secondary)] truncate pr-2">{m.name}</span>
                    <span className="text-xs font-bold text-[var(--text-primary)]">{m.count}</span>
                 </div>
              ))}
              {recentModules.length === 0 && (
                <p className="text-[10px] text-[var(--text-tertiary)]">No recent module data.</p>
              )}
            </div>
          </OrgCard>
          
           <OrgCard>
            <OrgSectionTitle>Time Range</OrgSectionTitle>
            <div className="flex items-center gap-2 mt-2">
               <Calendar className="w-4 h-4 text-[var(--text-tertiary)]" />
               <span className="text-xs text-[var(--text-secondary)] font-medium">Recent 100 Operations</span>
            </div>
          </OrgCard>
        </div>
      </div>
    </div>
  );
}
