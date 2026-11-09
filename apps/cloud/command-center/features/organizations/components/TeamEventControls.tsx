"use client";

import { useMemo, useState } from "react";
import { useOrganizationTeamEventActions, useSetOrganizationTeamEvent } from "../api/organization-console-api";
import { GovernedActionButton } from "./GovernedActionButton";

type Team = { id: string; name: string; version: number; events: Array<{ event_id: string; permissions: Record<string, unknown>; authorization_version: 0 | 1 }> };

export function TeamEventControls({ orgId, team, events, blocked, lifecycle }: {
  orgId: string; team: Team; events: Array<{ id: string; name?: string; slug?: string }>;
  blocked: boolean; lifecycle: (teamId: string, command: () => Promise<void>) => Promise<void>;
}) {
  const [eventId, setEventId] = useState("");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const actions = useOrganizationTeamEventActions(orgId, eventId);
  const mutation = useSetOrganizationTeamEvent(orgId);
  const binding = team.events.find(item => item.event_id === eventId);
  const available = useMemo(() => new Set(actions.data?.actions ?? []), [actions.data?.actions]);
  const unavailableOverrides = Object.keys(permissions).filter(code => !available.has(code));
  const malformedOverrides = Object.values(permissions).some(value => typeof value !== "boolean");
  const disabled = blocked || mutation.isPending || actions.isFetching || actions.isError || !actions.data || unavailableOverrides.length > 0 || malformedOverrides;
  return <div className="space-y-2">
    <label className="block text-xs">Event
      <select aria-label={`Event for ${team.name}`} disabled={mutation.isPending} value={eventId} onChange={event => {
        const selected = event.target.value; setEventId(selected);
        const existing = team.events.find(item => item.event_id === selected)?.permissions ?? {};
        // Keep legacy values visible as a reconciliation error; never silently
        // normalize them into valid grants or discard them on ordinary loading.
        setPermissions({ ...existing } as Record<string, boolean>);
      }} className="mt-1 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-2 py-1.5">
        <option value="">Select event</option>{events.map(event => <option key={event.id} value={event.id}>{event.name ?? event.slug}</option>)}
      </select>
    </label>
    {eventId && <>
      {binding && binding.authorization_version !== 1 && <p role="alert" className="text-xs">Review required: this legacy assignment does not grant access. Review and save explicit permissions with an audit reason.</p>}
      {actions.isError && <p role="alert" className="text-xs">Available actions could not be loaded. Retry loading before saving. <button type="button" onClick={() => void actions.refetch()}>Retry</button></p>}
      {actions.isFetching && <p role="status" className="text-xs">Loading grantable actions…</p>}
      {!actions.isFetching && actions.data && <div className="max-h-56 space-y-1 overflow-y-auto">
        {actions.data.actions.map(code => <label key={code} className="flex items-center justify-between gap-2 text-xs">
          <span>{code}</span><select aria-label={`${code} for ${team.name}`} disabled={mutation.isPending || blocked}
            value={permissions[code] === true ? "allow" : permissions[code] === false ? "deny" : "inherit"}
            onChange={event => setPermissions(current => { const next = { ...current }; if (event.target.value === "inherit") delete next[code]; else next[code] = event.target.value === "allow"; return next; })}>
            <option value="inherit">No team override</option><option value="allow">Allow</option><option value="deny">Deny</option>
          </select>
        </label>)}
      </div>}
      <p className="text-xs">Save replaces this event's team overrides. Billing and organisation administration are excluded.</p>
      {!actions.isFetching && actions.data && unavailableOverrides.length > 0 && <p role="alert" className="text-xs">
        Some saved overrides are outside your grantable actions. Review them before replacing this binding: {unavailableOverrides.join(", ")}
      </p>}
      {malformedOverrides && <p role="alert" className="text-xs">Saved overrides contain invalid values. Review and explicitly clear the draft before entering a replacement.</p>}
      <button type="button" disabled={mutation.isPending || blocked} onClick={() => setPermissions({})} className="text-xs underline">Clear draft overrides</button>
      {Object.keys(permissions).length > 100 && <p role="alert" className="text-xs">Choose at most 100 explicit overrides.</p>}
      <div className="flex gap-3">
        <GovernedActionButton label="Save event permissions" title={`Save event permissions for ${team.name}`} requireCaseReference={false}
          disabled={disabled || Object.keys(permissions).length > 100} onConfirm={({ reason }) => lifecycle(team.id,
            () => mutation.mutateAsync({ teamId: team.id, eventId, assigned: true, permissions, version: team.version, reason }).then(() => undefined))} />
        {binding && <GovernedActionButton label="Remove event assignment" title={`Remove event from ${team.name}`} requireCaseReference={false}
          disabled={blocked || mutation.isPending} onConfirm={({ reason }) => lifecycle(team.id,
            () => mutation.mutateAsync({ teamId: team.id, eventId, assigned: false, permissions: {}, version: team.version, reason }).then(() => undefined))} />}
      </div>
    </>}
  </div>;
}
