"use client";

import { useParams } from "next/navigation";
import { Network, CheckCircle2, XCircle, AlertCircle, Plus } from "lucide-react";
import { useOrganizationDomain } from "@/features/organizations/api/organization-console-api";
import {
  OrgPageHeader, OrgCard, OrgDataTable, OrgStatusBadge,
  OrgSectionTitle, OrgMetricCard, UnavailableDomain, LoadingPage,
} from "@/features/organizations/components/OrgPageShared";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function IntegrationsPageScreen() {
  const params = useParams<{ orgId: string }>();
  const { data, isLoading } = useOrganizationDomain(params.orgId, "integrations");

  if (isLoading) return <LoadingPage />;
  if (!data?.availability?.available) return <UnavailableDomain reason={data?.availability?.reason} />;

  const domainData = data?.data as any;
  const connections: any[] = domainData?.connections ?? [];

  const connectedCount = connections.filter((c) => c.is_active).length;
  const disconnectedCount = connections.length - connectedCount;
  const providers: string[] = Array.from(new Set(connections.map((c) => c.provider_name || c.provider_id)));

  const chartData = [
    { name: "Connected", value: connectedCount },
    { name: "Disconnected", value: disconnectedCount },
  ].filter((d) => d.value > 0);

  const COLORS = ["var(--chart-2)", "var(--chart-5)"];

  return (
    <div className="p-6 space-y-6">
      <OrgPageHeader
        icon={Network}
        title="Integrations"
        description="Connect and manage third-party applications and services."
        generatedAt={data?.generated_at}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <OrgMetricCard label="Total Integrations" value={connections.length} />
        <OrgMetricCard label="Connected" value={connectedCount} sub={`${connections.length > 0 ? Math.round((connectedCount / connections.length) * 100) : 0}% of total`} />
        <OrgMetricCard label="Providers" value={providers.length} />
        <OrgMetricCard label="Disconnected" value={disconnectedCount} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <OrgDataTable
            columns={[
              { key: "name", header: "Integration", render: (c: any) => (
                <div>
                  <p className="text-xs font-bold text-[var(--text-primary)]">{c.provider_name || "—"}</p>
                  <p className="text-[10px] font-mono text-[var(--text-tertiary)]">{c.id?.slice(0, 20)}</p>
                </div>
              )},
              { key: "provider", header: "Provider ID", render: (c: any) => (
                <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{c.provider_id?.slice(0, 20)}</span>
              )},
              { key: "status", header: "Status", render: (c: any) => (
                <OrgStatusBadge status={c.is_active ? "CONNECTED" : "DISCONNECTED"} />
              )},
            ]}
            rows={connections}
            keyFn={(c: any) => c.id}
            emptyMessage="No integrations connected yet"
          />
        </div>

        <OrgCard className="flex flex-col items-center justify-center">
          <OrgSectionTitle>Integration Health</OrgSectionTitle>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} strokeWidth={0}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 12 }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-8">
              <Network className="w-10 h-10 mx-auto text-[var(--text-tertiary)] mb-3" />
              <p className="text-xs text-[var(--text-tertiary)]">No integrations connected</p>
            </div>
          )}
          <div className="w-full space-y-2 mt-3 border-t border-[var(--border-subtle)] pt-3">
            {[
              { label: "Connected", value: connectedCount, icon: CheckCircle2, color: "text-[var(--status-success)]" },
              { label: "Disconnected", value: disconnectedCount, icon: XCircle, color: "text-[var(--status-danger)]" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                  <span className="text-xs text-[var(--text-secondary)]">{label}</span>
                </div>
                <span className="text-xs font-bold text-[var(--text-primary)]">{value}</span>
              </div>
            ))}
          </div>
        </OrgCard>
      </div>
    </div>
  );
}
