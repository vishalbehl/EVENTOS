"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, KeyRound, PlugZap, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";
import { PageContainer } from "@/components/super-admin/ui/PageContainer";
import { SectionHeader } from "@/components/super-admin/ui/SectionHeader";
import {
  OperationsSourceAccessKey,
  useAdminOrgs,
  useCreateOperationsSourceAccess,
  useOperationsSourceAccess,
  useOrgEvents,
  useRevokeOperationsSourceAccess,
  useVenueReadiness,
} from "@/services/super-admin-service";

const rows = <T,>(value: T[] | { items?: T[] } | undefined): T[] => Array.isArray(value) ? value : value?.items ?? [];

const sourceLabels: Record<"registration_server" | "venue_server", string> = {
  registration_server: "Registration API",
  venue_server: "Venue API",
};

function statusClass(status: OperationsSourceAccessKey["status"]) {
  if (status === "ACTIVE") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  if (status === "REVOKED") return "border-rose-400/20 bg-rose-400/10 text-rose-300";
  return "border-amber-400/20 bg-amber-400/10 text-amber-300";
}

function dateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}

function errorText(error: unknown) {
  if (error instanceof ApiError) {
    return `${error.status ? `HTTP ${error.status}: ` : ""}${error.message}`;
  }
  if (error instanceof Error) return error.message;
  return "Unknown request failure";
}

function dateTimeLocalMin() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function VenueReadinessPage() {
  const [organizationId, setOrganizationId] = useState("");
  const [eventId, setEventId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createOrganizationId, setCreateOrganizationId] = useState("");
  const [createEventId, setCreateEventId] = useState("");
  const [sourceType, setSourceType] = useState<"registration_server" | "venue_server">("registration_server");
  const [sourceName, setSourceName] = useState("Registration Server");
  const [sourceExpiresAt, setSourceExpiresAt] = useState("");

  const scope = { organization_id: organizationId || undefined, event_id: eventId || undefined };
  const query = useVenueReadiness(scope);
  const sourceAccess = useOperationsSourceAccess(scope);
  const createSourceAccess = useCreateOperationsSourceAccess();
  const revokeSourceAccess = useRevokeOperationsSourceAccess();
  const organizations = useAdminOrgs({ limit: 200 });
  const filterEvents = useOrgEvents(organizationId);
  const createEvents = useOrgEvents(createOrganizationId);

  const organizationRows = rows(organizations.data);
  const filterEventRows = rows<{ id: string; name: string }>(filterEvents.data as any);
  const createEventRows = rows<{ id: string; name: string }>(createEvents.data as any);
  const apiRows = sourceAccess.data?.items ?? [];
  const kpis = sourceAccess.data?.kpis;
  const computedKpis = useMemo(() => ({
    total: kpis?.total ?? apiRows.length,
    active: kpis?.active ?? apiRows.filter(key => key.status === "ACTIVE").length,
    revoked: kpis?.revoked ?? apiRows.filter(key => key.status === "REVOKED").length,
    used: kpis?.used ?? apiRows.filter(key => key.last_used_at).length,
    recoverable: kpis?.recoverable ?? apiRows.filter(key => key.api_key_recoverable).length,
    registration: kpis?.registration_server ?? apiRows.filter(key => key.source_type === "registration_server").length,
    venue: kpis?.venue_server ?? apiRows.filter(key => key.source_type === "venue_server").length,
  }), [apiRows, kpis]);
  const sourceExpiryInvalid = Boolean(sourceExpiresAt && new Date(sourceExpiresAt) <= new Date());

  const copyText = async (label: string, value?: string | null) => {
    if (!value) {
      toast.error(`${label} is not available for this API key`);
      return;
    }
    await navigator.clipboard?.writeText(value);
    toast.success(`${label} copied`);
  };

  const copySetup = async (key: OperationsSourceAccessKey) => {
    if (!key.api_key) {
      toast.error("This legacy key cannot be recovered because it was created before encrypted storage.");
      return;
    }
    await navigator.clipboard?.writeText(`SOURCE_URL=${key.api_url || key.source_url || sourceAccess.data?.source_url || ""}\nSOURCE_API_KEY=${key.api_key}`);
    toast.success("Source URL and API key copied");
  };

  const openCreateModal = () => {
    setCreateOrganizationId(organizationId);
    setCreateEventId(eventId);
    setSourceType("registration_server");
    setSourceName("Registration Server");
    setSourceExpiresAt("");
    setCreateOpen(true);
  };

  const createApi = async () => {
    try {
      await createSourceAccess.mutateAsync({
        idempotencyKey: crypto.randomUUID(),
        body: {
          organization_id: createOrganizationId,
          event_id: createEventId,
          source_type: sourceType,
          name: sourceName,
          permissions: { read: true, push: true },
          expires_at: sourceExpiresAt ? new Date(sourceExpiresAt).toISOString() : null,
        },
      });
      setCreateOpen(false);
      if (!organizationId) setOrganizationId(createOrganizationId);
      if (!eventId) setEventId(createEventId);
      toast.success("API key created and stored encrypted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create source API");
    }
  };

  return (
    <PageContainer>
      <SectionHeader
        title="Venue Readiness"
        description="Encrypted source APIs for Registration Server and Venue Server access, with live usage and revocation state."
        breadcrumb={["Console", "Operations", "Venue Readiness"]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { query.refetch(); sourceAccess.refetch(); }}>
              <RefreshCw className="mr-2 h-4 w-4" />Refresh
            </Button>
            <Button size="sm" onClick={openCreateModal}>
              <KeyRound className="mr-2 h-4 w-4" />Create API
            </Button>
          </div>
        }
      />

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "APIs created", value: computedKpis.total, icon: KeyRound, tone: "from-cyan-400/20 to-blue-500/10" },
          { label: "Active APIs", value: computedKpis.active, icon: CheckCircle2, tone: "from-emerald-400/20 to-teal-500/10" },
          { label: "Revoked APIs", value: computedKpis.revoked, icon: XCircle, tone: "from-rose-400/20 to-red-500/10" },
          { label: "Keys used", value: computedKpis.used, icon: PlugZap, tone: "from-violet-400/20 to-fuchsia-500/10" },
          { label: "Copyable keys", value: computedKpis.recoverable, icon: ShieldCheck, tone: "from-amber-300/20 to-orange-500/10" },
        ].map(card => (
          <Card key={card.label} className={`overflow-hidden border-white/10 bg-gradient-to-br ${card.tone} p-4`}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-tertiary">{card.label}</p>
              <card.icon className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-3 text-3xl font-black text-primary">{card.value}</p>
          </Card>
        ))}
      </div>

      <Card className="mb-5 border-brand/20 bg-brand/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-brand" />
              <h2 className="font-bold text-primary">Access vault</h2>
            </div>
            <p className="mt-2 text-sm text-secondary">
              API keys are stored encrypted in the database and shown masked in the table. Authorized operators can copy the original key again.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-tertiary">
            {query.data?.deployment_profile || "local"} Â· {sourceAccess.data?.freshness_at ? new Date(sourceAccess.data.freshness_at).toLocaleString() : "No freshness"}
          </div>
        </div>
      </Card>

      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1 space-y-1.5">
            <Label htmlFor="filter-organization">Filter organization</Label>
            <select id="filter-organization" value={organizationId} onChange={event => { setOrganizationId(event.target.value); setEventId(""); }} className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm">
              <option value="">All organizations</option>
              {organizationRows.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          </div>
          <div className="min-w-64 flex-1 space-y-1.5">
            <Label htmlFor="filter-event">Filter event</Label>
            <select id="filter-event" value={eventId} onChange={event => setEventId(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm" disabled={!organizationId}>
              <option value="">{organizationId ? filterEvents.isFetching ? "Loading events..." : "All events" : "Select organization first"}</option>
              {filterEventRows.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}
            </select>
          </div>
          <Button variant="outline" onClick={() => { setOrganizationId(""); setEventId(""); }}>Clear filters</Button>
        </div>
      </Card>

      {query.isError && (
        <Card className="mb-5 border-warning/30 bg-warning/10 p-4 text-warning">
          <AlertTriangle className="mb-2 h-5 w-5" />
          <p className="font-semibold">Sync and device readiness telemetry is unavailable.</p>
          <p className="mt-1 text-xs">{errorText(query.error)}</p>
        </Card>
      )}

      {sourceAccess.isError ? (
        <Card className="mb-5 border-danger/30 p-6 text-danger">
          <AlertTriangle className="mb-2 h-5 w-5" />
          <p className="font-semibold">Source API inventory is unavailable.</p>
          <p className="mt-1 text-xs">{errorText(sourceAccess.error)}</p>
          <p className="mt-2 text-xs text-secondary">If this says a column is missing, restart the backend after running Alembic migrations.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
            <div>
              <h2 className="font-bold text-primary">Created source APIs</h2>
              <p className="mt-1 text-xs text-secondary">{computedKpis.registration} registration APIs Â· {computedKpis.venue} venue APIs</p>
            </div>
            <Button onClick={openCreateModal}><KeyRound className="mr-2 h-4 w-4" />Create API</Button>
          </div>
          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[1040px] table-fixed text-left text-xs">
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[22%]" />
                <col className="w-[28%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead className="border-b border-border bg-surface-2/80 text-[10px] uppercase tracking-[0.18em] text-tertiary">
                <tr>
                  <th className="px-5 py-3">API</th>
                  <th className="px-5 py-3">Scope</th>
                  <th className="px-5 py-3">Credentials</th>
                  <th className="px-5 py-3">Activity</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {apiRows.map(key => (
                  <tr key={key.id} className="border-b border-border/80 align-top transition-colors hover:bg-surface-2/50">
                    <td className="px-5 py-5">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-primary">{key.name}</p>
                          <Badge className="border-brand/20 bg-brand/10 text-brand">{sourceLabels[key.source_type]}</Badge>
                        </div>
                        <p className="font-mono text-[10px] text-tertiary">{key.id}</p>
                        <Badge className={`w-fit ${statusClass(key.status)}`}>{key.status}</Badge>
                      </div>
                    </td>
                    <td className="px-5 py-5">
                      <div className="space-y-2">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-tertiary">Organization</p>
                          <p className="mt-1 truncate font-semibold text-primary" title={key.organization_name || key.organization_id}>{key.organization_name || key.organization_id}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-tertiary">Event</p>
                          <p className="mt-1 truncate text-secondary" title={key.event_name || key.event_id}>{key.event_name || key.event_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-5">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-tertiary">URL</p>
                            <code className="mt-1 block truncate font-mono text-[11px] text-secondary">{key.api_url || key.source_url || sourceAccess.data?.source_url}</code>
                          </div>
                          <Button size="sm" variant="ghost" className="shrink-0" onClick={() => copyText("API URL", key.api_url || key.source_url || sourceAccess.data?.source_url)}><Copy className="h-3.5 w-3.5" /></Button>
                        </div>
                        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-tertiary">Key</p>
                            <code className="mt-1 block truncate font-mono text-[11px] text-primary">{key.masked_key || `${key.key_prefix}••••••`}</code>
                          </div>
                          <Button size="sm" variant="ghost" className="shrink-0" disabled={!key.api_key_recoverable} onClick={() => copyText("API key", key.api_key)}><Copy className="h-3.5 w-3.5" /></Button>
                        </div>
                        {!key.api_key_recoverable && <p className="text-[10px] text-warning">Legacy key not recoverable</p>}
                      </div>
                    </td>
                    <td className="px-5 py-5">
                      <div className="space-y-2 text-[11px]">
                        <div>
                          <p className="text-tertiary">Last used</p>
                          <p className="mt-0.5 text-secondary">{dateTime(key.last_used_at)}</p>
                        </div>
                        <div>
                          <p className="text-tertiary">Created</p>
                          <p className="mt-0.5 text-secondary">{dateTime(key.created_at)}</p>
                        </div>
                        <div>
                          <p className="text-tertiary">Expires</p>
                          <p className="mt-0.5 text-secondary">{key.expires_at ? dateTime(key.expires_at) : "Never"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-5 text-right">
                      <div className="flex flex-col items-end gap-2">
                        <Button size="sm" variant="outline" className="w-28" disabled={!key.api_key_recoverable} onClick={() => copySetup(key)}>Copy setup</Button>
                        {key.status === "ACTIVE" && (
                          <Button size="sm" variant="outline" className="w-28" disabled={revokeSourceAccess.isPending} onClick={async () => {
                            const revokeReason = window.prompt("Reason for revoking this source key");
                            if (!revokeReason || revokeReason.trim().length < 12) {
                              toast.error("A revoke reason of at least 12 characters is required");
                              return;
                            }
                            try {
                              await revokeSourceAccess.mutateAsync({ keyId: key.id, body: { organization_id: key.organization_id, reason: revokeReason } });
                              toast.success("Source key revoked");
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : "Could not revoke source key");
                            }
                          }}>Revoke</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!sourceAccess.isLoading && !apiRows.length && (
                  <tr><td colSpan={5} className="p-10 text-center text-secondary">No source APIs exist for this scope. Create one for a Registration Server or Venue Server.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-border xl:hidden">
            {apiRows.map(key => (
              <div key={key.id} className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-primary">{key.name}</p>
                      <Badge className="border-brand/20 bg-brand/10 text-brand">{sourceLabels[key.source_type]}</Badge>
                    </div>
                    <p className="mt-1 truncate text-sm text-secondary">{key.event_name || key.event_id}</p>
                    <p className="mt-1 truncate text-xs text-tertiary">{key.organization_name || key.organization_id}</p>
                  </div>
                  <Badge className={statusClass(key.status)}>{key.status}</Badge>
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-tertiary">URL</p>
                      <code className="mt-1 block truncate font-mono text-[11px] text-secondary">{key.api_url || key.source_url || sourceAccess.data?.source_url}</code>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => copyText("API URL", key.api_url || key.source_url || sourceAccess.data?.source_url)}><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-tertiary">Key</p>
                      <code className="mt-1 block truncate font-mono text-[11px] text-primary">{key.masked_key || `${key.key_prefix}••••••`}</code>
                    </div>
                    <Button size="sm" variant="ghost" disabled={!key.api_key_recoverable} onClick={() => copyText("API key", key.api_key)}><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <div className="grid gap-2 text-xs text-secondary sm:grid-cols-2">
                  <p><span className="text-tertiary">Last used:</span> {dateTime(key.last_used_at)}</p>
                  <p><span className="text-tertiary">Created:</span> {dateTime(key.created_at)}</p>
                  <p><span className="text-tertiary">Expires:</span> {key.expires_at ? dateTime(key.expires_at) : "Never"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={!key.api_key_recoverable} onClick={() => copySetup(key)}>Copy setup</Button>
                  {key.status === "ACTIVE" && (
                    <Button size="sm" variant="outline" disabled={revokeSourceAccess.isPending} onClick={async () => {
                      const revokeReason = window.prompt("Reason for revoking this source key");
                      if (!revokeReason || revokeReason.trim().length < 12) {
                        toast.error("A revoke reason of at least 12 characters is required");
                        return;
                      }
                      try {
                        await revokeSourceAccess.mutateAsync({ keyId: key.id, body: { organization_id: key.organization_id, reason: revokeReason } });
                        toast.success("Source key revoked");
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Could not revoke source key");
                      }
                    }}>Revoke</Button>
                  )}
                </div>
              </div>
            ))}
            {!sourceAccess.isLoading && !apiRows.length && (
              <div className="p-10 text-center text-secondary">No source APIs exist for this scope. Create one for a Registration Server or Venue Server.</div>
            )}
          </div>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create source API</DialogTitle>
            <DialogDescription>
              Choose the organization, event, API type, and name. The generated key is stored encrypted and can be copied again from the table.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="api-organization">Organization</Label>
              <select id="api-organization" value={createOrganizationId} onChange={event => { setCreateOrganizationId(event.target.value); setCreateEventId(""); }} className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm">
                <option value="">Select organization</option>
                {organizationRows.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="api-event">Event</Label>
              <select id="api-event" value={createEventId} onChange={event => setCreateEventId(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm" disabled={!createOrganizationId}>
                <option value="">{createOrganizationId ? createEvents.isFetching ? "Loading events..." : "Select event" : "Select organization first"}</option>
                {createEventRows.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="api-type">API type</Label>
              <select id="api-type" value={sourceType} onChange={event => { const value = event.target.value as "registration_server" | "venue_server"; setSourceType(value); setSourceName(value === "registration_server" ? "Registration Server" : "Venue Server"); }} className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm">
                <option value="registration_server">Registration API</option>
                <option value="venue_server">Venue API</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="api-name">API name</Label>
              <Input id="api-name" value={sourceName} onChange={event => setSourceName(event.target.value)} placeholder="Front desk registration server" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="api-expires-at">Expiration date and time</Label>
              <Input
                id="api-expires-at"
                type="datetime-local"
                value={sourceExpiresAt}
                min={dateTimeLocalMin()}
                onChange={event => setSourceExpiresAt(event.target.value)}
              />
              <p className={sourceExpiryInvalid ? "text-xs text-warning" : "text-xs text-tertiary"}>
                {sourceExpiryInvalid ? "Choose a future expiration date and time." : "Optional. Leave blank for no expiration. Expired keys are blocked by the backend and shown as expired in the inventory."}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={createSourceAccess.isPending} onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={!createOrganizationId || !createEventId || sourceName.trim().length < 2 || sourceExpiryInvalid || createSourceAccess.isPending} onClick={createApi}>
              {createSourceAccess.isPending ? "Creating..." : "Create encrypted API"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
