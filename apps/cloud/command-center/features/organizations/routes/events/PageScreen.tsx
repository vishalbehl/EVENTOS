"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Calendar,
  Search,
  Plus,
  Settings,
  Eye,
  Lock,
  Wrench,
  RefreshCw,
  Layers,
  Check,
  X,
  Shield,
  Sparkles,
  Smartphone,
  Award,
  FileText,
  QrCode,
} from "lucide-react";
import {
  useOrganizationEvents,
  useResolvedEntitlements,
  useUpdateEventStatus,
  useEventRegistrationWorkspace,
  useCorrectEventRegistration,
  usePrivilegedAccessSessions,
  useEventDomainWorkspace,
} from "@/features/organizations/api/organization-console-api";
import { toast } from "sonner";
import {
  OrgPageHeader,
  OrgCard,
  OrgDataTable,
  OrgStatusBadge,
  OrgSectionTitle,
  OrgMetricCard,
  LoadingPage,
} from "@/features/organizations/components/OrgPageShared";
import { GovernedActionButton } from "@/features/organizations/components/GovernedActionButton";
import { EventResourceControlPanel } from "@/features/organizations/components/EventResourceControlPanel";
import { EventWorkspaceActionsPanel } from "@/features/organizations/components/EventWorkspaceActionsPanel";
import { EventAccessCommercePanel } from "@/features/organizations/components/EventAccessCommercePanel";
import { EventTemplateControlPanel } from "@/features/organizations/components/EventTemplateControlPanel";

const ALL_EVENT_MODULES = [
  { key: "registration", label: "Registration Workflow", icon: FileText },
  { key: "abstracts", label: "Abstract Management", icon: FileText },
  { key: "speaker_module", label: "Speaker Management", icon: Settings },
  { key: "certificates", label: "Certificate Builder", icon: Award },
  { key: "badge_builder", label: "Badge Builder", icon: QrCode },
  { key: "mobile_app", label: "Dedicated Mobile App", icon: Smartphone },
  { key: "ai_assistant", label: "AI Event Assistant", icon: Sparkles },
  { key: "whatsapp", label: "WhatsApp Gateway", icon: Settings },
];

function WorkspaceDataView({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-4">
      {Object.entries(data).map(([section, value]) => {
        if (Array.isArray(value))
          return (
            <OrgCard key={section}>
              <OrgSectionTitle>{section.replace(/_/g, " ")}</OrgSectionTitle>
              <div className="space-y-2">
                {value.map((item: any, index) => (
                  <div
                    key={item.id ?? index}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-3)] p-3"
                  >
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {Object.entries(item)
                        .filter(
                          ([key]) =>
                            ![
                              "body_html",
                              "body_text",
                              "template_data",
                            ].includes(key),
                        )
                        .slice(0, 12)
                        .map(([key, field]) => (
                          <div key={key}>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                              {key.replace(/_/g, " ")}
                            </p>
                            <p className="break-words text-[11px] text-[var(--text-primary)]">
                              {field == null
                                ? "—"
                                : typeof field === "object"
                                  ? JSON.stringify(field)
                                  : String(field)}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
                {!value.length && (
                  <p className="text-xs text-[var(--text-tertiary)]">
                    No records in this workspace.
                  </p>
                )}
              </div>
            </OrgCard>
          );
        if (value && typeof value === "object")
          return (
            <OrgCard key={section}>
              <OrgSectionTitle>{section.replace(/_/g, " ")}</OrgSectionTitle>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(value as Record<string, unknown>).map(
                  ([key, field]) => (
                    <div key={key}>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        {key.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs font-bold text-[var(--text-primary)]">
                        {field == null
                          ? "—"
                          : typeof field === "object"
                            ? JSON.stringify(field)
                            : String(field)}
                      </p>
                    </div>
                  ),
                )}
              </div>
            </OrgCard>
          );
        return null;
      })}
    </div>
  );
}

export default function EventsPageScreen() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const [search, setSearch] = useState("");
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [eventTab, setEventTab] = useState("overview");

  const {
    data: events = [],
    isLoading,
    isError,
    refetch,
  } = useOrganizationEvents(orgId);
  const privilegedAccess = usePrivilegedAccessSessions(orgId);
  const activeAccess = privilegedAccess.data?.items.find(
    (item) =>
      item.active &&
      item.field_categories.includes("IDENTITY") &&
      item.field_categories.includes("CONTACT"),
  );
  const registrations = useEventRegistrationWorkspace(
    orgId,
    selectedEvent?.id ?? "",
    includeSensitive,
    activeAccess?.id,
  );
  const domainWorkspace = useEventDomainWorkspace(
    orgId,
    selectedEvent?.id ?? "",
    eventTab,
    includeSensitive,
    activeAccess?.id,
  );
  const correctRegistration = useCorrectEventRegistration(
    orgId,
    selectedEvent?.id ?? "",
  );
  const resolvedEntitlements = useResolvedEntitlements(orgId, selectedEvent?.id || "");
  const updateStatus = useUpdateEventStatus(orgId, selectedEvent?.id || "");

  if (isLoading) return <LoadingPage />;
  if (isError)
    return (
      <div className="p-6">
        <OrgCard>
          <p className="text-sm font-bold text-[var(--status-danger)]">
            Event directory unavailable
          </p>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            The event service failed. No empty organization state is inferred.
          </p>
        </OrgCard>
      </div>
    );

  const filteredEvents = events.filter((ev: any) => {
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      ev.name?.toLowerCase().includes(q) ||
      ev.slug?.toLowerCase().includes(q);
    const matchStatus =
      !statusFilter || (ev.status || "ACTIVE") === statusFilter;
    return matchSearch && matchStatus;
  });

  const activeCount = events.filter((ev: any) => ev.status === "ACTIVE").length;
  const totalRegs = events.reduce(
    (acc: number, ev: any) => acc + (ev.registrations_count || 0),
    0,
  );

  const handleToggleMaintenance = async () => {
    if (!selectedEvent) return;
    const nextVal = !selectedEvent.is_maintenance;
    try {
      await updateStatus.mutateAsync({
        is_maintenance: nextVal,
        reason: "Toggled from Event Command Center",
      });
      setSelectedEvent((prev: any) => ({ ...prev, is_maintenance: nextVal }));
      toast.success(
        nextVal ? "Event set to maintenance mode" : "Maintenance mode disabled",
      );
      refetch();
    } catch (e: any) {
      toast.error("Failed to update maintenance mode");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <OrgPageHeader
        icon={Calendar}
        title="Events Workspace"
        description="Comprehensive Event Directory & 360° Event Command Center."
        actions={
          <button
            onClick={() =>
              toast.info(
                "Use the super admin event provisioner to launch new events.",
              )
            }
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--brand-primary)] text-[var(--primary-contrast)] text-xs font-bold hover:bg-[var(--brand-primary-hover)] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Provision Event
          </button>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <OrgMetricCard label="Total Events" value={events.length} />
        <OrgMetricCard label="Active Events" value={activeCount} />
        <OrgMetricCard
          label="Total Registrations"
          value={totalRegs.toLocaleString()}
        />
        <OrgMetricCard
          label="Draft / Archived"
          value={events.length - activeCount}
        />
      </div>

      {/* Directory Filter Toolbar */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events by name or slug…"
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] px-3 py-2 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="DRAFT">Draft</option>
          <option value="COMPLETED">Completed</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>

      {/* Events Table */}
      <OrgDataTable
        columns={[
          {
            key: "name",
            header: "Event Name",
            render: (ev: any) => (
              <div>
                <p className="text-xs font-bold text-[var(--text-primary)]">
                  {ev.name || ev.id}
                </p>
                <p className="text-[10px] font-mono text-[var(--text-tertiary)]">
                  {ev.slug || ev.id}
                </p>
              </div>
            ),
          },
          {
            key: "dates",
            header: "Dates",
            render: (ev: any) => (
              <span className="text-[11px] text-[var(--text-secondary)] font-mono">
                {ev.start_date
                  ? new Date(ev.start_date).toLocaleDateString()
                  : "TBD"}
              </span>
            ),
          },
          {
            key: "venue",
            header: "Venue",
            render: (ev: any) => (
              <span className="text-xs text-[var(--text-secondary)]">
                {ev.venue_name || "Online"}
              </span>
            ),
          },
          {
            key: "regs",
            header: "Registrations",
            render: (ev: any) => (
              <span className="text-xs font-bold font-mono text-[var(--text-primary)]">
                {(ev.registrations_count || 0).toLocaleString()}
              </span>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (ev: any) => (
              <div className="flex items-center gap-1.5">
                <OrgStatusBadge status={ev.status || "ACTIVE"} />
                {ev.is_maintenance && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--status-warning-muted)] text-[var(--status-warning)] text-[9px] font-bold">
                    MAINTENANCE
                  </span>
                )}
              </div>
            ),
          },
          {
            key: "open",
            header: "Command",
            render: (ev: any) => (
              <button
                onClick={() => {
                  setSelectedEvent(ev);
                  setEventTab("overview");
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-3)] text-xs font-bold text-[var(--brand-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                Event Console
              </button>
            ),
          },
        ]}
        rows={filteredEvents}
        keyFn={(ev: any) => ev.id}
        emptyMessage="No events found in this organization directory"
      />

      {/* ── Per-Event Command Center Modal ─────────────────── */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-[var(--border-default)] bg-[var(--bg-surface-3)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[var(--brand-primary)]/10 flex items-center justify-center text-[var(--brand-primary)] font-black">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[var(--text-primary)]">
                    {selectedEvent.name || selectedEvent.id}
                  </h3>
                  <p className="text-[10px] font-mono text-[var(--text-tertiary)]">
                    Event ID: {selectedEvent.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1.5 rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-1 overflow-x-auto px-4 pt-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)]">
              {[
                { key: "overview", label: "Overview" },
                { key: "registrations", label: "Registrations" },
                { key: "attendees", label: "Attendees" },
                { key: "speakers", label: "Speakers" },
                { key: "abstracts", label: "Abstracts" },
                { key: "sessions", label: "Agenda" },
                { key: "rooms", label: "Rooms" },
                { key: "communications", label: "Communications" },
                { key: "templates", label: "Templates" },
                { key: "files", label: "Files" },
                { key: "payments", label: "Payments" },
                { key: "tickets", label: "Tickets" },
                { key: "checkins", label: "Check-ins" },
                { key: "users", label: "Event Users" },
                { key: "jobs", label: "Jobs" },
                { key: "integrations", label: "Integrations" },
                { key: "analytics", label: "Analytics" },
                { key: "audit", label: "Audit" },
                { key: "features", label: "Feature Master Switches" },
                { key: "settings", label: "Event Settings" },
                { key: "operations", label: "Event Control & Maintenance" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setEventTab(tab.key)}
                  className={`shrink-0 whitespace-nowrap px-3 py-2 text-xs font-bold border-b-2 transition-all ${
                    eventTab === tab.key
                      ? "border-[var(--brand-primary)] text-[var(--brand-primary)]"
                      : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {eventTab === "overview" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-3 rounded-xl bg-[var(--bg-surface-3)] border border-[var(--border-subtle)]">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        Registrations
                      </p>
                      <p className="text-lg font-black text-[var(--text-primary)]">
                        {selectedEvent.registrations_count == null
                          ? "Not measured"
                          : Number(selectedEvent.registrations_count).toLocaleString()}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-[var(--bg-surface-3)] border border-[var(--border-subtle)]">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        Financial data
                      </p>
                      <p className="text-xs font-bold text-[var(--text-tertiary)]">
                        Use Payments for event transactions; Revenue Console owns the ledger.
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-[var(--bg-surface-3)] border border-[var(--border-subtle)]">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        Venue
                      </p>
                      <p className="text-xs font-bold text-[var(--text-primary)]">
                        {selectedEvent.venue_name || "Not configured"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {eventTab === "features" && (
                <div className="space-y-4">
                  <p className="text-xs text-[var(--text-tertiary)]">
                    Canonical resolved entitlements. Submit any change through Commercial so it receives independent approval.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {ALL_EVENT_MODULES.map((mod) => {
                      const resolvedValues = resolvedEntitlements.data?.values;
                      const available = Boolean(resolvedValues) && Object.prototype.hasOwnProperty.call(resolvedValues, mod.key);
                      const enabled = available ? Boolean(resolvedValues?.[mod.key]) : false;
                      const Icon = mod.icon;
                      return (
                        <div
                          key={mod.key}
                          className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4 text-[var(--brand-primary)]" />
                            <span className="text-xs font-bold text-[var(--text-primary)]">
                              {mod.label}
                            </span>
                          </div>
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                              !available
                                ? "bg-[var(--bg-surface)] text-[var(--text-tertiary)]"
                                :
                              enabled
                                ? "bg-[var(--status-success-muted)] text-[var(--status-success)]"
                                : "bg-[var(--bg-surface)] text-[var(--text-tertiary)]"
                            }`}
                          >
                            {resolvedEntitlements.isError ? "UNAVAILABLE" : !available ? "NOT CONFIGURED" : enabled ? "ENABLED" : "RESTRICTED"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {eventTab === "registrations" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <OrgSectionTitle>
                        Registration administration
                      </OrgSectionTitle>
                      <p className="text-[10px] text-[var(--text-tertiary)]">
                        Source: registration.registrations. Personal data is
                        masked unless a valid sensitive-data session is active.
                      </p>
                    </div>
                    <button
                      disabled={!activeAccess}
                      onClick={() => setIncludeSensitive((value) => !value)}
                      className="rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs font-bold text-[var(--brand-primary)] disabled:opacity-40"
                    >
                      {includeSensitive
                        ? "Mask personal data"
                        : activeAccess
                          ? "Reveal personal data"
                          : "Start access in Security"}
                    </button>
                  </div>
                  {registrations.isError ? (
                    <div className="rounded-xl border border-[var(--status-danger)]/30 p-4 text-xs text-[var(--status-danger)]">
                      Registration data is unavailable; no zero count is
                      inferred.
                    </div>
                  ) : (
                    <OrgDataTable
                      columns={[
                        {
                          key: "attendee",
                          header: "Attendee",
                          render: (row: any) => (
                            <div>
                              <p className="text-xs font-bold text-[var(--text-primary)]">
                                {String(
                                  row.registration_data.name ?? "Unknown",
                                )}
                              </p>
                              <p className="text-[10px] text-[var(--text-tertiary)]">
                                {String(
                                  row.registration_data.email ?? "No email",
                                )}
                              </p>
                            </div>
                          ),
                        },
                        {
                          key: "submitted",
                          header: "Submitted",
                          render: (row: any) => (
                            <span className="text-[10px] font-mono">
                              {new Date(row.submitted_at).toLocaleString()}
                            </span>
                          ),
                        },
                        {
                          key: "status",
                          header: "Status",
                          render: (row: any) => (
                            <OrgStatusBadge status={row.status} />
                          ),
                        },
                        {
                          key: "actions",
                          header: "Administrative correction",
                          render: (row: any) => (
                            <div className="flex gap-2">
                              {["APPROVED", "WAITLISTED", "REJECTED"]
                                .filter((status) => status !== row.status)
                                .map((status) => (
                                  <GovernedActionButton
                                    key={status}
                                    label={status}
                                    title={`${status[0]}${status.slice(1).toLowerCase()} registration`}
                                    onConfirm={async ({ reason, caseReference }) => {
                                      try {
                                        await correctRegistration.mutateAsync({
                                          registrationId: row.id,
                                          status: status as
                                            | "APPROVED"
                                            | "WAITLISTED"
                                            | "REJECTED",
                                          reason,
                                          case_reference: caseReference,
                                          rejection_reason: status === "REJECTED" ? reason : undefined,
                                        });
                                        toast.success(
                                          `Registration changed to ${status.toLowerCase()}`,
                                        );
                                      } catch (error) {
                                        toast.error(
                                          error instanceof Error
                                            ? error.message
                                            : "Registration correction failed",
                                        );
                                        throw error;
                                      }
                                    }}
                                    className="text-[9px] font-bold text-[var(--brand-primary)]"
                                  />
                                ))}
                            </div>
                          ),
                        },
                      ]}
                      rows={registrations.data?.items ?? []}
                      keyFn={(row: any) => row.id}
                      emptyMessage="No registrations recorded for this event"
                    />
                  )}
                </div>
              )}

              {[
                "speakers",
                "attendees",
                "abstracts",
                "sessions",
                "rooms",
                "communications",
                "templates",
                "files",
                "payments",
                "tickets",
                "checkins",
                "users",
                "jobs",
                "integrations",
                "analytics",
                "audit",
              ].includes(eventTab) && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <OrgSectionTitle>
                        {eventTab.replace(/_/g, " ")}
                      </OrgSectionTitle>
                      <p className="text-[10px] text-[var(--text-tertiary)]">
                        Source:{" "}
                        {domainWorkspace.data?.source ??
                          "authoritative domain unavailable"}
                      </p>
                    </div>
                    {[
                      "speakers",
                      "attendees",
                      "abstracts",
                      "communications",
                      "payments",
                      "users",
                    ].includes(eventTab) && (
                      <button
                        disabled={!activeAccess}
                        onClick={() => setIncludeSensitive((value) => !value)}
                        className="rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs font-bold text-[var(--brand-primary)] disabled:opacity-40"
                      >
                        {includeSensitive
                          ? "Mask sensitive fields"
                          : activeAccess
                            ? "Reveal sensitive fields"
                            : "Start access in Security"}
                      </button>
                    )}
                  </div>
                  {domainWorkspace.isError ? (
                    <div className="rounded-xl border border-[var(--status-danger)]/30 p-4 text-xs text-[var(--status-danger)]">
                      This event workspace is unavailable. No empty state is
                      inferred.
                    </div>
                  ) : domainWorkspace.isLoading ? (
                    <LoadingPage />
                  ) : (
                    <>
                      {eventTab === "templates" && (
                        <EventTemplateControlPanel
                          orgId={orgId}
                          eventId={String(selectedEvent.id)}
                          data={domainWorkspace.data?.data ?? {}}
                        />
                      )}
                      {["tickets", "checkins", "users"].includes(eventTab) && (
                        <EventAccessCommercePanel
                          orgId={orgId}
                          eventId={String(selectedEvent.id)}
                          workspace={eventTab}
                          data={domainWorkspace.data?.data ?? {}}
                        />
                      )}
                      <EventResourceControlPanel
                        orgId={orgId}
                        eventId={String(selectedEvent.id)}
                        workspace={eventTab}
                        data={domainWorkspace.data?.data ?? {}}
                      />
                      <EventWorkspaceActionsPanel
                        orgId={orgId}
                        eventId={String(selectedEvent.id)}
                        workspace={eventTab}
                        data={domainWorkspace.data?.data ?? {}}
                      />
                      <WorkspaceDataView
                        data={domainWorkspace.data?.data ?? {}}
                      />
                    </>
                  )}
                </div>
              )}

              {eventTab === "settings" && (
                <div className="space-y-4">
                  <OrgSectionTitle>Event Configuration</OrgSectionTitle>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                        Event Title
                      </label>
                      <input
                        readOnly
                        value={selectedEvent.name || ""}
                        className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-primary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                        URL Slug
                      </label>
                      <input
                        readOnly
                        value={selectedEvent.slug || ""}
                        className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-primary)]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {eventTab === "operations" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-[var(--status-warning)]/30 bg-[var(--status-warning)]/5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)]">
                        Maintenance Mode
                      </p>
                      <p className="text-[10px] text-[var(--text-tertiary)]">
                        Block attendee logins & registrations during updates.
                      </p>
                    </div>
                    <button
                      onClick={handleToggleMaintenance}
                      className="px-3 py-1.5 rounded-xl bg-[var(--status-warning)] text-white text-xs font-bold"
                    >
                      {selectedEvent.is_maintenance
                        ? "Disable Maintenance"
                        : "Enable Maintenance"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
