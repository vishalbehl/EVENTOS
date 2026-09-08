"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  History,
  Sparkles,
} from "lucide-react";
import { apiGet } from "@/lib/api-client";
import {
  useVenueOpsOverview,
  useVenueOpsMutations,
  useVenueOpsQuotes,
  useVenueOpsQuoteActions,
  useVenueOpsRealtime,
} from "@/hooks/useVenueOperations";

type Section = "overview" | "recommendations" | "quotes" | "activity";

const links = (eventId: string) =>
  [
    ["Overview", `/events/${eventId}/venue-ops`, Activity],
    [
      "Recommendations",
      `/events/${eventId}/venue-ops/recommendations`,
      Sparkles,
    ],
    [
      "Requirements",
      `/events/${eventId}/venue-ops/requirements`,
      ClipboardList,
    ],
    ["Quotes & proposals", `/events/${eventId}/venue-ops/quotes`, FileText],
    ["Activity", `/events/${eventId}/venue-ops/activity`, History],
  ] as const;

function Frame({
  eventId,
  section,
  children,
  title,
  eyebrow,
  realtimeConnected,
}: {
  eventId: string;
  section: Section;
  children: React.ReactNode;
  title: string;
  eyebrow: string;
  realtimeConnected: boolean;
}) {
  const overviewQuery = useVenueOpsOverview(eventId);
  if (overviewQuery.isLoading)
    return (
      <div className="p-10 text-sm text-[var(--text-secondary)]">
        Loading Venue Ops…
      </div>
    );
  if (overviewQuery.isError || !overviewQuery.data)
    return (
      <div className="m-6 rounded-2xl border border-red-300/30 p-8 text-sm text-red-300">
        Venue Ops is unavailable. Refresh and try again.
      </div>
    );
  const overview = { data: overviewQuery.data };
  const data = overview.data;
  const facts = data.facts;
  return (
    <main className="min-h-full bg-[radial-gradient(circle_at_top_right,rgba(17,94,89,.18),transparent_38%),var(--bg-page)] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="border-b border-[var(--border-subtle)] pb-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[.24em] text-[var(--pri)]">
              Venue Ops / {overview.data.event.name}
            </p>
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-bold ${realtimeConnected ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}
            >
              {realtimeConnected
                ? "Live sync connected"
                : "Syncing through refresh"}
            </span>
          </div>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-[var(--text-primary)]">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
            {eyebrow}
          </p>
          <nav className="mt-7 flex flex-wrap gap-2">
            {links(eventId).map(([label, href, Icon]) => (
              <Link
                key={href}
                href={href}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${href.endsWith(section) || (section === "overview" && href.endsWith("venue-ops")) ? "border-[var(--pri)] bg-[var(--pri)]/10 text-[var(--pri)]" : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
              >
                <Icon className="size-3.5" />
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <section className="grid gap-3 py-6 sm:grid-cols-3 lg:grid-cols-5">
          {[
            ["Registrations", facts.registrations],
            ["Speakers", facts.speakers],
            ["Rooms", facts.rooms],
            ["Sessions", facts.sessions],
            ["Event days", facts.event_days],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4"
            >
              <p className="text-2xl font-black text-[var(--text-primary)]">
                {String(value ?? "—")}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {label}
              </p>
            </div>
          ))}
        </section>
        {children}
      </div>
    </main>
  );
}

export default function VenueOpsSectionPage({
  eventId,
  section,
}: {
  eventId: string;
  section: Section;
}) {
  const overviewQuery = useVenueOpsOverview(eventId);
  const quotes = useVenueOpsQuotes(eventId);
  const quoteActions = useVenueOpsQuoteActions(eventId);
  const mutations = useVenueOpsMutations(eventId);
  const requestId = overviewQuery.data?.request?.id;
  const timeline = useQuery({
    queryKey: ["venue-ops-timeline", requestId],
    queryFn: () => apiGet<any[]>(`/service-requests/${requestId}/timeline`),
    enabled: section === "activity" && !!requestId,
  });
  const refreshRealtime = useCallback(() => {
    void overviewQuery.refetch();
    void quotes.refetch();
    if (section === "activity") void timeline.refetch();
  }, [overviewQuery.refetch, quotes.refetch, section, timeline.refetch]);
  const realtime = useVenueOpsRealtime(eventId, refreshRealtime);
  if (overviewQuery.isLoading)
    return (
      <div className="p-10 text-sm text-[var(--text-secondary)]">
        Loading Venue Ops…
      </div>
    );
  if (overviewQuery.isError || !overviewQuery.data)
    return (
      <div className="m-6 rounded-2xl border border-red-300/30 p-8 text-sm text-red-300">
        Venue Ops is unavailable. Refresh and try again.
      </div>
    );
  const overview = { data: overviewQuery.data };

  if (section === "recommendations")
    return (
      <Frame
        eventId={eventId}
        section={section}
        realtimeConnected={realtime.connected}
        title="Recommendations"
        eyebrow="Review the operational services suggested from your event facts and planning assumptions."
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--text-secondary)]">
            Recommendations use the latest authoritative event facts.
          </p>
          <button
            disabled={mutations.recalculate.isPending}
            onClick={() => mutations.recalculate.mutate()}
            className="rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] disabled:opacity-40"
          >
            {mutations.recalculate.isPending
              ? "Recalculating…"
              : "Recalculate recommendations"}
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {overview.data?.recommendations.map((item) => (
            <article
              key={item.service_code}
              className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black text-[var(--text-primary)]">
                    {item.service_name}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-wider text-[var(--pri)]">
                    {item.priority.toLowerCase()}
                  </p>
                </div>
                <span className="text-2xl font-black text-[var(--text-primary)]">
                  {item.suggested_quantity}
                </span>
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
                {item.reason}
              </p>
              <Link
                href={`/events/${eventId}/venue-ops/requirements`}
                className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-[var(--pri)]"
              >
                Review in requirements <ArrowRight className="size-3.5" />
              </Link>
            </article>
          ))}
        </div>
      </Frame>
    );
  if (section === "quotes")
    return (
      <Frame
        eventId={eventId}
        section={section}
        realtimeConnected={realtime.connected}
        title="Quotes & proposals"
        eyebrow="Review Command Center quotations, proposal versions, and the document state for each commercial response."
      >
        <div className="space-y-3">
          {quotes.data?.length ? (
            quotes.data.map((quote) => (
              <article
                key={quote.id}
                className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-[var(--text-primary)]">
                      {quote.title}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {quote.quote_number} · version {quote.version}
                    </p>
                  </div>
                  <p className="text-lg font-black text-[var(--text-primary)]">
                    {new Intl.NumberFormat("en-IN", {
                      style: "currency",
                      currency: quote.currency,
                    }).format(Number(quote.total_amount))}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-3 text-xs">
                  <span className="rounded-full bg-[var(--pri)]/10 px-3 py-1 font-bold text-[var(--pri)]">
                    {quote.status.replaceAll("_", " ")}
                  </span>
                  {quote.proposal && (
                    <span className="rounded-full bg-[var(--bg-surface-2)] px-3 py-1 text-[var(--text-secondary)]">
                      Proposal v{quote.proposal.current_version}
                    </span>
                  )}
                  {quote.documents?.[0] && (
                    <span className="rounded-full bg-[var(--bg-surface-2)] px-3 py-1 text-[var(--text-secondary)]">
                      PDF {quote.documents[0].status.toLowerCase()}
                    </span>
                  )}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    disabled={
                      !quote.proposal || quoteActions.requestPdf.isPending
                    }
                    onClick={() =>
                      quote.proposal &&
                      quoteActions.requestPdf.mutate({
                        proposalId: quote.proposal.id,
                        expectedVersion: quote.proposal.current_version,
                        reason:
                          "Organiser requested the Venue Ops proposal PDF.",
                      })
                    }
                    className="rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] disabled:opacity-40"
                  >
                    Generate PDF
                  </button>
                  {quote.documents?.[0]?.status === "COMPLETED" &&
                    quote.proposal && (
                      <button
                        onClick={async () => {
                          const document = await apiGet<{
                            download_url: string;
                          }>(
                            `/service-requests/proposals/${quote.proposal!.id}/documents/${quote.documents[0].export_id}/download`,
                          );
                          window.open(
                            document.download_url,
                            "_blank",
                            "noopener,noreferrer",
                          );
                        }}
                        className="rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-xs font-bold text-[var(--text-primary)]"
                      >
                        Download PDF
                      </button>
                    )}
                  {!["ORGANISER_APPROVED", "DECLINED"].includes(
                    quote.status,
                  ) && (
                    <>
                      <button
                        onClick={() => {
                          const reason = window.prompt(
                            "What should Command Center revise?",
                          );
                          if (reason)
                            quoteActions.revision.mutate({
                              quoteId: quote.id,
                              expectedVersion: quote.version,
                              reason,
                            });
                        }}
                        className="rounded-xl border border-amber-400/30 px-3 py-2 text-xs font-bold text-amber-300"
                      >
                        Request revision
                      </button>
                      <button
                        onClick={() => {
                          const reason = window.prompt(
                            "Confirm why you approve this quote:",
                          );
                          if (reason)
                            quoteActions.decide.mutate({
                              quoteId: quote.id,
                              expectedVersion: quote.version,
                              action: "APPROVE",
                              reason,
                            });
                        }}
                        className="rounded-xl bg-[var(--pri)] px-3 py-2 text-xs font-bold text-white"
                      >
                        Approve quote
                      </button>
                      <button
                        onClick={() => {
                          const reason = window.prompt(
                            "Why are you declining this quote?",
                          );
                          if (reason)
                            quoteActions.decide.mutate({
                              quoteId: quote.id,
                              expectedVersion: quote.version,
                              action: "DECLINE",
                              reason,
                            });
                        }}
                        className="rounded-xl border border-red-300/30 px-3 py-2 text-xs font-bold text-red-300"
                      >
                        Decline
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-3xl border border-dashed border-[var(--border-subtle)] p-10 text-sm text-[var(--text-secondary)]">
              No quotations have been sent for this event yet.
            </div>
          )}
        </div>
      </Frame>
    );
  if (section === "activity")
    return (
      <Frame
        eventId={eventId}
        section={section}
        realtimeConnected={realtime.connected}
        title="Activity"
        eyebrow="Follow the auditable request, clarification, quotation, document, and approval history."
      >
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6">
          {!requestId ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Activity begins when you save your first requirement brief.
            </p>
          ) : timeline.isLoading ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Loading activity…
            </p>
          ) : timeline.data?.length ? (
            <div className="space-y-4">
              {timeline.data.map((entry: any, index: number) => (
                <div
                  key={entry.id || index}
                  className="flex gap-3 border-b border-[var(--border-subtle)] pb-4 last:border-0"
                >
                  <CheckCircle2 className="mt-0.5 size-4 text-[var(--pri)]" />
                  <div>
                    <p className="text-sm font-bold text-[var(--text-primary)]">
                      {entry.action || entry.status || "Request updated"}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {entry.created_at ||
                        entry.timestamp ||
                        "Recorded in Venue Ops"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              No timeline entries are available yet.
            </p>
          )}
        </div>
      </Frame>
    );
  return (
    <Frame
      eventId={eventId}
      section="overview"
      realtimeConnected={realtime.connected}
      title="Operational control room"
      eyebrow="See the event signals, current request state, and the next safe action for your venue services."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-7">
          <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[var(--pri)]">
            Current brief
          </p>
          <h2 className="mt-3 text-2xl font-black text-[var(--text-primary)]">
            {overview.data.request
              ? overview.data.request.title
              : "No requirements saved yet"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            {overview.data.request
              ? `${overview.data.request.items.length} services in the brief · ${overview.data.request.status.replaceAll("_", " ")}`
              : "Start with the recommendations, then build the operational scope Command Center should quote."}
          </p>
          <Link
            href={`/events/${eventId}/venue-ops/requirements`}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--pri)] px-4 py-3 text-sm font-bold text-white"
          >
            {overview.data.request ? "Open requirements" : "Build requirements"}
            <ArrowRight className="size-4" />
          </Link>
        </section>
        <aside className="rounded-3xl border border-[var(--pri)]/30 bg-[var(--pri)]/5 p-7">
          <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[var(--pri)]">
            Next action
          </p>
          <p className="mt-3 text-lg font-black text-[var(--text-primary)]">
            {overview.data.request?.status === "SUBMITTED"
              ? "Command Center is reviewing"
              : overview.data.request
                ? "Keep the brief current"
                : "Review recommendations"}
          </p>
          <Link
            href={`/events/${eventId}/venue-ops/${overview.data.request ? "activity" : "recommendations"}`}
            className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-[var(--pri)]"
          >
            Continue <ArrowRight className="size-3.5" />
          </Link>
        </aside>
      </div>
    </Frame>
  );
}
