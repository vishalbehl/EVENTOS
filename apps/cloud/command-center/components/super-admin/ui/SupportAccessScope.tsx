"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminOrgs } from "@/services/super-admin-service";

export interface SupportAccessSelection {
  organizationId: string;
  reason: string;
  accessRequestId: string;
}

interface SupportAccessScopeProps {
  value: SupportAccessSelection | null;
  onApply: (selection: SupportAccessSelection) => void;
}

export function SupportAccessScope({ value, onApply }: SupportAccessScopeProps) {
  const [organizationId, setOrganizationId] = useState(value?.organizationId ?? "");
  const [reason, setReason] = useState(value?.reason ?? "");
  const { data: organizations = [], isLoading } = useAdminOrgs({ limit: 200 });
  const canApply = Boolean(organizationId) && reason.trim().length >= 12;

  return (
    <section
      aria-labelledby="support-access-title"
      className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-4"
    >
      <div className="mb-3 flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-warning)]" aria-hidden="true" />
        <div>
          <h2 id="support-access-title" className="text-sm font-semibold text-[var(--text-primary)]">
            Audited tenant support access
          </h2>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            Select one organization and record the operational reason. Access is tenant-scoped and written to the immutable audit trail.
          </p>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(240px,0.8fr)_minmax(320px,1.4fr)_auto]">
        <div>
          <label htmlFor="support-organization" className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
            Organization
          </label>
          <Select value={organizationId} onValueChange={setOrganizationId} disabled={isLoading}>
            <SelectTrigger id="support-organization" aria-label="Support organization">
              <SelectValue placeholder={isLoading ? "Loading organizations..." : "Select organization"} />
            </SelectTrigger>
            <SelectContent>
              {organizations.map((organization) => (
                <SelectItem key={organization.id} value={organization.id}>
                  {organization.name} ({organization.slug})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor="support-reason" className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
            Access reason
          </label>
          <Input
            id="support-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Example: Investigating customer billing case EX-1042"
            minLength={12}
            maxLength={500}
          />
        </div>
        <Button
          className="self-end"
          disabled={!canApply}
          onClick={() => onApply({
            organizationId,
            reason: reason.trim(),
            accessRequestId: crypto.randomUUID(),
          })}
        >
          Apply scope
        </Button>
      </div>
      {value ? (
        <p className="mt-3 text-[11px] text-[var(--status-success)]" role="status">
          Tenant scope is active. Changing either field requires applying the scope again.
        </p>
      ) : null}
    </section>
  );
}
