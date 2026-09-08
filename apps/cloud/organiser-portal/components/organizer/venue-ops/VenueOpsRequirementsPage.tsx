"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Loader2, Plus, Save } from "lucide-react";
import Link from "next/link";
import {
  useVenueOpsMutations,
  useVenueOpsOverview,
  useVenueOpsRealtime,
  VenueOpsItem,
} from "@/hooks/useVenueOperations";

export default function VenueOpsRequirementsPage({
  eventId,
}: {
  eventId: string;
}) {
  const overview = useVenueOpsOverview(eventId);
  const mutations = useVenueOpsMutations(eventId);
  const [items, setItems] = useState<VenueOpsItem[]>([]);
  const [custom, setCustom] = useState("");
  const [notice, setNotice] = useState("");
  const refreshRealtime = useCallback(() => {
    void overview.refetch();
  }, [overview.refetch]);
  const realtime = useVenueOpsRealtime(eventId, refreshRealtime);
  useEffect(() => {
    if (!overview.data) return;
    if (overview.data.request) {
      setItems(overview.data.request.items || []);
      return;
    }
    setItems(
      overview.data.recommendations.map((item) => ({
        description: item.service_name,
        quantity: item.suggested_quantity,
        source: "RECOMMENDED",
        configuration: {
          service_code: item.service_code,
          template_version: item.template_version,
        },
      })),
    );
  }, [overview.data]);
  if (overview.isLoading)
    return (
      <div className="p-10 text-sm text-[var(--text-secondary)]">
        Loading requirements…
      </div>
    );
  if (!overview.data)
    return (
      <div className="m-6 rounded-2xl border border-red-300/30 p-8 text-sm text-red-300">
        Requirements are unavailable. Refresh and try again.
      </div>
    );
  const request = overview.data.request;
  const editable =
    !request ||
    request.status === "DRAFT" ||
    request.status === "REVISION_REQUESTED";
  const save = async (): Promise<string | undefined> => {
    setNotice("");
    try {
      const result: any = request
        ? await mutations.update.mutateAsync({
            requestId: request.id,
            items,
            planning_overrides: request.planning_overrides,
            expected_version: request.version,
          })
        : await mutations.create.mutateAsync({
            title: `${overview.data.event.name} Venue Ops`,
            items,
            planning_overrides: {},
          });
      setNotice("Requirements saved.");
      return result?.id || request?.id;
    } catch (error: any) {
      setNotice(error?.message || "Requirements could not be saved.");
      return undefined;
    }
  };
  const submit = async () => {
    const requestId = await save();
    if (requestId)
      await mutations.submit.mutateAsync({
        requestId,
        expectedVersion: request ? request.version + 1 : undefined,
      });
    setNotice("Requirements sent to Command Center.");
  };
  return (
    <main className="min-h-full bg-[radial-gradient(circle_at_top_right,rgba(17,94,89,.18),transparent_38%),var(--bg-page)] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-[var(--border-subtle)] pb-7">
          <p className="text-[11px] font-bold uppercase tracking-[.24em] text-[var(--pri)]">
            Venue Ops / requirements
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-[var(--text-primary)]">
            Build the quotation brief
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
            Set the services, quantities, rooms, and notes Command Center should
            use when preparing your quotation.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href={`/events/${eventId}/venue-ops`}
              className="rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)]"
            >
              Back to overview
            </Link>
            <span className="rounded-xl bg-[var(--pri)]/10 px-3 py-2 text-xs font-bold text-[var(--pri)]">
              {request?.status?.replaceAll("_", " ") || "Draft"}
            </span>
          </div>
        </header>
        <section className="mt-7 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[var(--pri)]">
                Scope
              </p>
              <h2 className="mt-2 text-2xl font-black text-[var(--text-primary)]">
                Selected services
              </h2>
            </div>
            <span className="text-xs text-[var(--text-secondary)]">
              {items.length} items
            </span>
          </div>
          <div className="mt-5 space-y-3">
            {items.map((item, index) => (
              <div
                key={`${item.description}-${index}`}
                className="flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    {item.description}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {item.source === "RECOMMENDED"
                      ? "From event recommendation"
                      : "Added by organiser"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-[var(--text-secondary)]">
                    Quantity
                    <input
                      disabled={!editable}
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index
                              ? {
                                  ...entry,
                                  quantity: Math.max(
                                    1,
                                    Number(event.target.value),
                                  ),
                                }
                              : entry,
                          ),
                        )
                      }
                      className="ml-2 w-20 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                    />
                  </label>
                  <button
                    disabled={!editable}
                    onClick={() =>
                      setItems((current) =>
                        current.filter((_, entryIndex) => entryIndex !== index),
                      )
                    }
                    className="text-xs font-bold text-red-300 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {editable && (
              <div className="flex gap-2">
                <input
                  value={custom}
                  onChange={(event) => setCustom(event.target.value)}
                  placeholder="Add a custom operational requirement"
                  className="min-w-0 flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-3 py-3 text-sm text-[var(--text-primary)]"
                />
                <button
                  onClick={() => {
                    if (custom.trim()) {
                      setItems((current) => [
                        ...current,
                        {
                          description: custom.trim(),
                          quantity: 1,
                          source: "CUSTOM",
                        },
                      ]);
                      setCustom("");
                    }
                  }}
                  className="rounded-xl bg-[var(--pri)] px-4 text-white"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            )}
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <button
              disabled={
                !editable ||
                mutations.create.isPending ||
                mutations.update.isPending
              }
              onClick={save}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] px-4 py-3 text-sm font-bold text-[var(--text-primary)] disabled:opacity-40"
            >
              <Save className="size-4" />
              Save draft
            </button>
            <button
              disabled={
                !editable || !items.length || mutations.submit.isPending
              }
              onClick={submit}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--pri)] px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
            >
              Send to Command Center <ArrowRight className="size-4" />
              {mutations.submit.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
            </button>
          </div>
          {notice && (
            <p
              className="mt-4 text-xs text-[var(--text-secondary)]"
              role="status"
            >
              {notice}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
