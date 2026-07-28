"use client";

import { useParams } from "next/navigation";
import { Cloud, HardDrive, FileIcon, Archive } from "lucide-react";
import { useOrganizationDomain } from "@/features/organizations/api/organization-console-api";
import {
  OrgPageHeader, OrgCard, OrgDataTable, OrgSectionTitle,
  OrgMetricCard, UnavailableDomain, LoadingPage,
} from "@/features/organizations/components/OrgPageShared";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "Not measured";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function StoragePageScreen() {
  const params = useParams<{ orgId: string }>();
  const { data, isLoading } = useOrganizationDomain(params.orgId, "storage");

  if (isLoading) return <LoadingPage />;
  if (!data?.availability?.available) return <UnavailableDomain reason={data?.availability?.reason} />;

  const domainData = data?.data as any;
  const storageBytes: number | null = domainData?.storage_bytes ?? null;
  const calculatedAt: string | null = domainData?.calculated_at ?? null;
  const backups = domainData?.backups;

  return (
    <div className="p-6 space-y-6">
      <OrgPageHeader
        icon={Cloud}
        title="Storage"
        description="Monitor storage usage and manage files."
        generatedAt={calculatedAt}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <OrgMetricCard label="Total Storage Used" value={formatBytes(storageBytes)} />
        <OrgMetricCard
          label="Last Calculated"
          value={calculatedAt ? new Date(calculatedAt).toLocaleDateString() : "—"}
        />
        <OrgMetricCard label="Backups" value={backups?.available ? "Available" : "Not configured"} />
        <OrgMetricCard label="Storage (bytes)" value={storageBytes == null ? "Not measured" : storageBytes.toLocaleString()} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Usage Gauge */}
        <OrgCard>
          <OrgSectionTitle>Storage Overview</OrgSectionTitle>
          <div className="text-5xl font-black text-[var(--text-primary)] mb-1">{formatBytes(storageBytes)}</div>
          <p className="text-xs text-[var(--text-tertiary)] mb-4">
            Total storage used
            {calculatedAt ? ` · Calculated ${new Date(calculatedAt).toLocaleDateString()}` : ""}
          </p>
          <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
            Effective allowance and hard ceiling are shown in Commercial → Usage; this screen does not invent a reference quota.
          </p>
        </OrgCard>

        {/* Backup Status */}
        <OrgCard>
          <OrgSectionTitle>Backup Status</OrgSectionTitle>
          {backups?.available ? (
            <div className="flex items-start gap-3">
              <Archive className="w-5 h-5 text-[var(--status-success)]" />
              <div>
                <p className="text-xs font-bold text-[var(--text-primary)]">Backups available</p>
                <p className="text-[11px] text-[var(--text-tertiary)]">Backup provider is configured for this organization.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <Archive className="w-5 h-5 text-[var(--text-tertiary)]" />
              <div>
                <p className="text-xs font-bold text-[var(--text-primary)]">Backups not configured</p>
                <p className="text-[11px] text-[var(--text-tertiary)]">
                  {backups?.reason || "No authoritative backup execution provider is configured for this organization."}
                </p>
              </div>
            </div>
          )}
        </OrgCard>
      </div>
    </div>
  );
}
