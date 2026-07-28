"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { Braces, Key, Webhook } from "lucide-react";
import { useOrganizationDomain } from "@/features/organizations/api/organization-console-api";
import {
  OrgPageHeader, OrgCard, OrgTabBar, OrgDataTable, OrgStatusBadge,
  OrgSectionTitle, OrgMetricCard, UnavailableDomain, LoadingPage,
} from "@/features/organizations/components/OrgPageShared";

export default function ApiWebhooksPageScreen() {
  const params = useParams<{ orgId: string }>();
  const [activeTab, setActiveTab] = useState("api-keys");
  const { data, isLoading } = useOrganizationDomain(params.orgId, "api-webhooks");

  if (isLoading) return <LoadingPage />;
  if (!data?.availability?.available) return <UnavailableDomain reason={data?.availability?.reason} />;

  const domainData = data?.data as any;
  const apiKeys: any[] = domainData?.api_keys ?? [];
  const webhooks: any[] = domainData?.webhooks ?? [];
  const deliveries: any[] = domainData?.deliveries ?? [];
  const apiUsage: any[] = domainData?.api_usage ?? [];

  const activeKeys = apiKeys.filter((k) => k.is_active).length;
  const activeWebhooks = webhooks.filter((w) => w.status === "active").length;

  const tabs = [
    { key: "api-keys", label: "API Keys" },
    { key: "webhooks", label: "Webhooks" },
    { key: "deliveries", label: "Delivery logs" },
    { key: "usage", label: "API usage" },
    { key: "docs", label: "Documentation" },
  ];

  return (
    <div className="p-6 space-y-6">
      <OrgPageHeader
        icon={Braces}
        title="API & Webhooks"
        description="Manage API access, keys and webhook endpoints."
        generatedAt={data?.generated_at}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <OrgMetricCard label="Active API Keys" value={activeKeys} />
        <OrgMetricCard label="Total Keys" value={apiKeys.length} />
        <OrgMetricCard label="Webhooks" value={webhooks.length} sub={`${activeWebhooks} active`} />
        <OrgMetricCard label="Total Deliveries" value={webhooks.reduce((acc, w) => acc + (w.total_deliveries || 0), 0)} />
      </div>

      <OrgTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "api-keys" && (
        <OrgDataTable
          columns={[
            { key: "name", header: "Name", render: (k: any) => (
              <div>
                <p className="text-xs font-bold text-[var(--text-primary)]">{k.name}</p>
                <p className="text-[10px] font-mono text-[var(--text-tertiary)]">{k.prefix}***</p>
              </div>
            )},
            { key: "status", header: "Status", render: (k: any) => (
              <OrgStatusBadge status={k.is_active ? "ACTIVE" : "INACTIVE"} />
            )},
            { key: "last_used", header: "Last Used", render: (k: any) => (
              <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}
              </span>
            )},
            { key: "expires", header: "Expires", render: (k: any) => (
              <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                {k.expires_at ? new Date(k.expires_at).toLocaleDateString() : "Never"}
              </span>
            )},
            { key: "created", header: "Created", render: (k: any) => (
              <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                {k.created_at ? new Date(k.created_at).toLocaleDateString() : "—"}
              </span>
            )},
          ]}
          rows={apiKeys}
          keyFn={(k: any) => k.id}
          emptyMessage="No API keys created yet"
        />
      )}

      {activeTab === "webhooks" && (
        <OrgDataTable
          columns={[
            { key: "url", header: "Endpoint URL", render: (w: any) => (
              <span className="text-xs font-mono text-[var(--text-primary)] truncate max-w-[200px] block">{w.url}</span>
            )},
            { key: "status", header: "Status", render: (w: any) => (
              <OrgStatusBadge status={w.status?.toUpperCase() || "INACTIVE"} />
            )},
            { key: "deliveries", header: "Deliveries", render: (w: any) => (
              <span className="text-xs font-bold font-mono text-[var(--text-secondary)]">{w.total_deliveries ?? 0}</span>
            )},
            { key: "failures", header: "Failures", render: (w: any) => (
              <span className={`text-xs font-bold font-mono ${w.total_failures > 0 ? "text-[var(--status-danger)]" : "text-[var(--text-tertiary)]"}`}>
                {w.total_failures ?? 0}
              </span>
            )},
            { key: "last_success", header: "Last Success", render: (w: any) => (
              <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                {w.last_success_at ? new Date(w.last_success_at).toLocaleDateString() : "—"}
              </span>
            )},
          ]}
          rows={webhooks}
          keyFn={(w: any) => w.id}
          emptyMessage="No webhook endpoints registered"
        />
      )}

      {activeTab === "deliveries" && <OrgDataTable columns={[
        { key: "webhook", header: "Webhook", render: (row: any) => <span className="font-mono text-[10px]">{row.webhook_id}</span> },
        { key: "status", header: "HTTP status", render: (row: any) => <OrgStatusBadge status={row.response_status >= 200 && row.response_status < 300 ? "DELIVERED" : "FAILED"} /> },
        { key: "code", header: "Response", render: (row: any) => <span className="font-mono text-xs font-bold">{row.response_status}</span> },
        { key: "time", header: "Delivered at", render: (row: any) => <span className="text-[10px]">{new Date(row.delivered_at).toLocaleString()}</span> },
      ]} rows={deliveries} keyFn={(row: any) => row.id} emptyMessage="No webhook delivery records found" />}

      {activeTab === "usage" && <OrgDataTable columns={[
        { key: "endpoint", header: "Endpoint", render: (row: any) => <span className="font-mono text-xs">{row.endpoint}</span> },
        { key: "calls", header: "Calls", render: (row: any) => <span className="font-mono text-xs font-bold">{Number(row.call_count).toLocaleString()}</span> },
        { key: "freshness", header: "Last metered", render: (row: any) => <span className="text-[10px]">{row.last_recorded_at ? new Date(row.last_recorded_at).toLocaleString() : "—"}</span> },
      ]} rows={apiUsage} keyFn={(row: any) => row.endpoint} emptyMessage="No API usage has been metered" />}

      {activeTab === "docs" && (
        <OrgCard>
          <OrgSectionTitle>API Documentation</OrgSectionTitle>
          <p className="text-xs text-[var(--text-tertiary)]">
            Comprehensive API documentation and guides are available through the Developer Console.
            Navigate to the Developer Console to access the full API catalogue, SDK references, and code samples.
          </p>
          <div className="mt-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Key className="w-4 h-4 text-[var(--brand-primary)]" />
              <span className="text-xs font-bold text-[var(--text-primary)]">Authentication</span>
            </div>
            <p className="text-[11px] text-[var(--text-tertiary)]">
              Use Bearer token authentication with your API key in the Authorization header.
            </p>
            <div className="mt-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2 font-mono text-[11px] text-[var(--text-secondary)]">
              Authorization: Bearer {"{your-api-key}"}
            </div>
          </div>
        </OrgCard>
      )}
    </div>
  );
}
