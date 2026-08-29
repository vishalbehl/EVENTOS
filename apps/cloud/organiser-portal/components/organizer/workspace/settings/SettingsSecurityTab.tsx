"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiClient, apiGet } from "@/lib/api-client";
import { Panel } from "../OrganiserPrimitives";
import { Unavailable } from "../OrganiserSection";
import { SettingsPage } from "./shared";
type Form = {
  require_mfa: boolean;
  allowed_auth_methods: string[];
  password_policy: {
    minimum_length: number;
    require_uppercase: boolean;
    require_lowercase: boolean;
    require_number: boolean;
    require_symbol: boolean;
  };
  session_policy: {
    idle_timeout_minutes: number;
    maximum_session_hours: number;
    maximum_active_sessions: number;
  };
  trusted_device_policy: { enabled: boolean; lifetime_days: number };
  sso_enforced: boolean;
  allowed_cidrs: string[];
};
const initial: Form = {
  require_mfa: false,
  allowed_auth_methods: ["PASSWORD"],
  password_policy: {
    minimum_length: 12,
    require_uppercase: true,
    require_lowercase: true,
    require_number: true,
    require_symbol: false,
  },
  session_policy: {
    idle_timeout_minutes: 60,
    maximum_session_hours: 24,
    maximum_active_sessions: 5,
  },
  trusted_device_policy: { enabled: true, lifetime_days: 30 },
  sso_enforced: false,
  allowed_cidrs: [],
};
export function SettingsSecurityTab() {
  const client = useQueryClient(),
    query = useQuery({
      queryKey: ["organisation-settings", "security"],
      queryFn: () => apiGet<any>("/organiser/settings/security"),
    }),
    [form, setForm] = useState<Form>(initial),
    [cidrs, setCidrs] = useState("");
  useEffect(() => {
    const p = query.data?.policy;
    if (!p) return;
    setForm({
      ...initial,
      ...p,
      password_policy: { ...initial.password_policy, ...p.password_policy },
      session_policy: { ...initial.session_policy, ...p.session_policy },
      trusted_device_policy: {
        ...initial.trusted_device_policy,
        ...p.trusted_device_policy,
      },
    });
    setCidrs((p.allowed_cidrs || []).join("\n"));
  }, [query.data]);
  const save = useMutation({
    mutationFn: () =>
      apiClient.put(
        "/organiser/settings/security",
        {
          ...form,
          allowed_cidrs: cidrs
            .split(/[,\n]/)
            .map((v) => v.trim())
            .filter(Boolean),
        },
        { headers: { "If-Match": String(query.data?.policy?.version || 0) } },
      ),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ["organisation-settings", "security"],
      });
      toast.success("Security policy saved and audited.");
    },
    onError: (e: any) =>
      toast.error(e?.message || "Security policy could not be saved."),
  });
  const check = (
    label: string,
    checked: boolean,
    onChange: (v: boolean) => void,
    help?: string,
  ) => (
    <label className="flex items-center justify-between gap-4 border-b border-[var(--op-border-soft)] py-3 last:border-0">
      <span>
        <strong className="block text-sm">{label}</strong>
        {help ? (
          <span className="text-xs text-[var(--op-muted)]">{help}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
  return (
    <SettingsPage
      actions={
        <Button
          disabled={
            save.isPending || !form.allowed_auth_methods.length || query.isError
          }
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving..." : "Save security"}
        </Button>
      }
    >
      {query.isError ? (
        <Unavailable>
          Security policy is unavailable or access is forbidden.
        </Unavailable>
      ) : null}
      <div className="op-content-grid">
        <Panel title="Identity and MFA">
          {check(
            "Require multi-factor authentication",
            form.require_mfa,
            (v) => setForm((f) => ({ ...f, require_mfa: v })),
            "Require an approved second factor.",
          )}
          {check(
            "Enforce configured SSO",
            form.sso_enforced,
            (v) => setForm((f) => ({ ...f, sso_enforced: v })),
            "Enable only after identity-provider verification.",
          )}
          <fieldset className="pt-4">
            <legend className="mb-2 text-sm font-semibold">
              Allowed authentication methods
            </legend>
            <div className="flex flex-wrap gap-4">
              {["PASSWORD", "TOTP", "SSO"].map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.allowed_auth_methods.includes(m)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        allowed_auth_methods: e.target.checked
                          ? [...new Set([...f.allowed_auth_methods, m])]
                          : f.allowed_auth_methods.filter((x) => x !== m),
                      }))
                    }
                  />
                  {m}
                </label>
              ))}
            </div>
          </fieldset>
        </Panel>
        <Panel title="Password policy">
          <label className="text-sm font-medium">
            Minimum length
            <input
              className="op-input mt-2 w-full"
              type="number"
              min={8}
              max={128}
              value={form.password_policy.minimum_length}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  password_policy: {
                    ...f.password_policy,
                    minimum_length: Number(e.target.value),
                  },
                }))
              }
            />
          </label>
          <div className="mt-3">
            {(
              [
                ["Require uppercase", "require_uppercase"],
                ["Require lowercase", "require_lowercase"],
                ["Require number", "require_number"],
                ["Require symbol", "require_symbol"],
              ] as const
            ).map(([l, k]) =>
              check(l, form.password_policy[k], (v) =>
                setForm((f) => ({
                  ...f,
                  password_policy: { ...f.password_policy, [k]: v },
                })),
              ),
            )}
          </div>
        </Panel>
        <Panel title="Sessions and trusted devices">
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["Idle timeout (minutes)", "idle_timeout_minutes"],
                ["Maximum session (hours)", "maximum_session_hours"],
                ["Maximum active sessions", "maximum_active_sessions"],
              ] as const
            ).map(([l, k]) => (
              <label key={k} className="text-sm font-medium">
                {l}
                <input
                  className="op-input mt-2 w-full"
                  type="number"
                  min={1}
                  value={form.session_policy[k]}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      session_policy: {
                        ...f.session_policy,
                        [k]: Number(e.target.value),
                      },
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <div className="mt-3">
            {check(
              "Allow trusted devices",
              form.trusted_device_policy.enabled,
              (v) =>
                setForm((f) => ({
                  ...f,
                  trusted_device_policy: {
                    ...f.trusted_device_policy,
                    enabled: v,
                  },
                })),
              "Trusted devices expire automatically.",
            )}
          </div>
          <label className="mt-3 block text-sm font-medium">
            Trusted-device lifetime (days)
            <input
              className="op-input mt-2 w-full"
              type="number"
              min={1}
              max={365}
              value={form.trusted_device_policy.lifetime_days}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  trusted_device_policy: {
                    ...f.trusted_device_policy,
                    lifetime_days: Number(e.target.value),
                  },
                }))
              }
            />
          </label>
        </Panel>
        <Panel title="Network policy">
          <label className="text-sm font-medium">
            Allowed IP ranges
            <textarea
              className="op-input mt-2 min-h-32 w-full"
              value={cidrs}
              onChange={(e) => setCidrs(e.target.value)}
              placeholder={"One CIDR per line\n203.0.113.0/24"}
            />
          </label>
          <p className="mt-2 text-xs text-[var(--op-muted)]">
            Leave empty to allow all networks. Validate access paths before
            restricting this list.
          </p>
        </Panel>
      </div>
      <p className="text-xs text-[var(--op-muted)]">
        Policy version {query.data?.policy?.version || "not configured"} ·
        Source: {query.data?.source || "Unavailable"} · Freshness:{" "}
        {query.data?.freshness_at
          ? new Date(query.data.freshness_at).toLocaleString()
          : "Unavailable"}
      </p>
    </SettingsPage>
  );
}
