"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Inbox, Search, X } from "lucide-react";
import { AreaChart, Area } from "recharts";
import { cn } from "@/lib/utils";

// â”€â”€â”€ OrganiserPage / PageContainer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function OrganiserPage({
  title,
  description,
  actions,
  tabs,
  children,
  attention,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
  attention?: ReactNode;
}) {
  return (
    <div className="relative w-full">
      <section className="mx-auto flex min-h-full w-full max-w-[1600px] shrink-0 flex-col space-y-6 px-[var(--space-page-x)] py-[var(--space-page-y)]">
        <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">{title}</h1>
            {description ? (
              <p className="max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex w-full flex-wrap items-center gap-2.5 md:w-auto">{actions}</div>
          ) : null}
        </header>
        {tabs ? <div className="border-b border-[var(--border-subtle)]">{tabs}</div> : null}
        {children}
      </section>
    </div>
  );
}

// â”€â”€â”€ PageTabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function PageTabs({
  tabs,
  active,
}: {
  tabs: Array<{ label: string; href: string }>;
  active: string;
}) {
  return (
    <nav className="flex flex-wrap items-stretch gap-x-5" aria-label="Page sections">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "relative pb-2.5 pt-1 text-xs font-semibold uppercase tracking-[0.08em] transition-colors duration-150",
            active === tab.label
              ? "text-[var(--text-primary)] after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-[var(--pri)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

// â”€â”€â”€ MetricCard / KpiCard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ICON_COLOR_MAP = {
  brand:   { hex: "var(--chart-4)", bg: "bg-[var(--brand-primary-muted)] text-[var(--brand-primary)]" },
  success: { hex: "var(--chart-2)", bg: "bg-[var(--status-success-muted)] text-[var(--status-success)]" },
  warning: { hex: "var(--chart-3)", bg: "bg-[var(--status-warning-muted)] text-[var(--status-warning)]" },
  danger:  { hex: "var(--chart-5)", bg: "bg-[var(--status-danger-muted)] text-[var(--status-danger)]" },
  info:    { hex: "var(--chart-1)", bg: "bg-[var(--info-muted)] text-[var(--info)]" },
} as const;

type IconColor = keyof typeof ICON_COLOR_MAP;

type MetricToneLegacy = "purple" | "amber" | "rose" | "green" | "blue" | "indigo" | "teal";
const LEGACY_TONE_MAP: Record<MetricToneLegacy, IconColor> = {
  purple: "brand",
  indigo: "brand",
  amber:  "warning",
  rose:   "danger",
  green:  "success",
  blue:   "info",
  teal:   "info",
};

export function MetricCard({
  label,
  value,
  hint,
  icon,
  iconColor,
  tone,
  href,
  delta,
  deltaLabel = "vs last 7d",
  trend = [],
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: ReactNode;
  iconColor?: IconColor;
  tone?: MetricToneLegacy | string;
  href?: string;
  delta?: number | null;
  deltaLabel?: string;
  trend?: number[];
}) {
  const resolvedColor: IconColor = iconColor ?? (tone ? (LEGACY_TONE_MAP[tone as MetricToneLegacy] ?? "brand") : "brand");
  const colors = ICON_COLOR_MAP[resolvedColor] ?? ICON_COLOR_MAP.brand;
  const hasDelta = typeof delta === "number" && Number.isFinite(delta);
  const deltaState = !hasDelta ? "missing" : delta! > 0 ? "positive" : delta! < 0 ? "negative" : "neutral";
  const chartData = trend.map((v, i) => ({ i, v }));
  const gradientId = `kpi-grad-${label.replace(/\s+/g, "-").toLowerCase()}`;

  const content = (
    <article
      aria-label={`${label}: ${value}`}
      className="op-metric-card group flex h-full min-h-40 flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 transition-transform duration-200 hover:-translate-y-0.5"
    >
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-lg border border-white/70 bg-[var(--bg-surface)] shadow-sm dark:border-white/10",
            colors.bg
          )}
        >
          {icon}
        </div>
        <span className="min-w-0 truncate text-xs font-medium text-[var(--text-secondary)]">{label}</span>
      </div>
      <div className="flex flex-1 items-center py-3">
        <span className="break-words font-mono text-3xl font-semibold tabular-nums tracking-[-0.045em] text-[var(--text-primary)]">
          {value}
        </span>
      </div>
      <div className="flex min-h-8 items-end justify-between gap-3 border-t border-[var(--border-subtle)] pt-2.5">
        <div className="min-w-0">
          {hasDelta ? (
            <span
              className={cn(
                "inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                deltaState === "positive" && "bg-[var(--status-success-muted)] text-[var(--status-success)]",
                deltaState === "negative" && "bg-[var(--status-danger-muted)] text-[var(--status-danger)]",
                deltaState === "neutral" && "bg-[var(--bg-surface-3)] text-[var(--text-tertiary)]"
              )}
            >
              {delta! > 0 ? `+${delta!.toFixed(1)}%` : `${delta!.toFixed(1)}%`}
            </span>
          ) : (
            <span className="text-[11px] font-medium text-[var(--text-tertiary)]">{hint ?? "No comparison"}</span>
          )}
          {deltaLabel && hasDelta && (
            <span className="ml-1.5 text-[10px] text-[var(--text-tertiary)]">{deltaLabel}</span>
          )}
        </div>
        {chartData.length > 0 && (
          <div
            className="h-8 w-24 shrink-0 opacity-70 transition-opacity duration-200 group-hover:opacity-100"
            role="img"
            aria-label={`${label} trend`}
          >
            <AreaChart width={96} height={32} data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors.hex} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={colors.hex} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={colors.hex} strokeWidth={2} fill={`url(#${gradientId})`} dot={false} />
            </AreaChart>
          </div>
        )}
      </div>
    </article>
  );

  return href ? (
    <Link
      href={href}
      className="block h-full rounded-[var(--radius-card)] no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] [&_*]:no-underline"
    >
      {content}
    </Link>
  ) : content;
}

// â”€â”€â”€ Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function Panel({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] cc-panel-shadow",
        className
      )}
    >
      {(title || action) ? (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-3.5">
          {title ? <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </div>
  );
}

// â”€â”€â”€ StatusBadge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STATUS_MAP: Record<string, { bg: string; dot: string; label: string }> = {
  active:    { bg: "bg-[var(--status-success-muted)] text-[var(--status-success)]", dot: "bg-[var(--status-success)]", label: "Active" },
  healthy:   { bg: "bg-[var(--status-success-muted)] text-[var(--status-success)]", dot: "bg-[var(--status-success)]", label: "Healthy" },
  paid:      { bg: "bg-[var(--status-success-muted)] text-[var(--status-success)]", dot: "bg-[var(--status-success)]", label: "Paid" },
  completed: { bg: "bg-[var(--status-success-muted)] text-[var(--status-success)]", dot: "bg-[var(--status-success)]", label: "Completed" },
  live:      { bg: "bg-[var(--status-success-muted)] text-[var(--status-success)]", dot: "bg-[var(--status-success)]", label: "Live" },
  trial:     { bg: "bg-[var(--status-info-muted)] text-[var(--status-info)]", dot: "bg-[var(--status-info)]", label: "Trial" },
  running:   { bg: "bg-[var(--status-info-muted)] text-[var(--status-info)]", dot: "bg-[var(--status-info)]", label: "Running" },
  pending:   { bg: "bg-[var(--status-info-muted)] text-[var(--status-info)]", dot: "bg-[var(--status-info)]", label: "Pending" },
  upcoming:  { bg: "bg-[var(--status-info-muted)] text-[var(--status-info)]", dot: "bg-[var(--status-info)]", label: "Upcoming" },
  grace:     { bg: "bg-[var(--status-warning-muted)] text-[var(--status-warning)]", dot: "bg-[var(--status-warning)]", label: "Grace Period" },
  warning:   { bg: "bg-[var(--status-warning-muted)] text-[var(--status-warning)]", dot: "bg-[var(--status-warning)]", label: "Warning" },
  degraded:  { bg: "bg-[var(--status-warning-muted)] text-[var(--status-warning)]", dot: "bg-[var(--status-warning)]", label: "Degraded" },
  suspended: { bg: "bg-[var(--status-danger-muted)] text-[var(--status-danger)]", dot: "bg-[var(--status-danger)]", label: "Suspended" },
  failed:    { bg: "bg-[var(--status-danger-muted)] text-[var(--status-danger)]", dot: "bg-[var(--status-danger)]", label: "Failed" },
  down:      { bg: "bg-[var(--status-danger-muted)] text-[var(--status-danger)]", dot: "bg-[var(--status-danger)]", label: "Down" },
  overdue:   { bg: "bg-[var(--status-danger-muted)] text-[var(--status-danger)]", dot: "bg-[var(--status-danger)]", label: "Overdue" },
  expired:   { bg: "bg-[var(--bg-surface-3)] text-[var(--text-tertiary)]", dot: "bg-[var(--text-tertiary)]", label: "Expired" },
  cancelled: { bg: "bg-[var(--bg-surface-3)] text-[var(--text-tertiary)]", dot: "bg-[var(--text-tertiary)]", label: "Cancelled" },
  draft:     { bg: "bg-[var(--bg-surface-3)] text-[var(--text-tertiary)]", dot: "bg-[var(--text-tertiary)]", label: "Draft" },
};

export function StatusBadge({ status }: { status: string }) {
  const norm = status.toLowerCase();
  const cfg = STATUS_MAP[norm] ?? { bg: "bg-[var(--bg-surface-3)] text-[var(--text-tertiary)]", dot: "bg-[var(--text-tertiary)]", label: status };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2.5 py-0.5 text-[11px] font-medium ",
        cfg.bg
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      <span className="capitalize">{cfg.label}</span>
    </span>
  );
}

// â”€â”€â”€ ToolbarSearch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function ToolbarSearch({
  placeholder = "Search...",
  value,
  onChange,
}: {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="flex h-[var(--control-height)] items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-[var(--text-secondary)]">
      <Search className="size-4 shrink-0" aria-hidden />
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
      />
    </label>
  );
}

// â”€â”€â”€ DataTable â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function DataTable({
  columns,
  rows,
  footer,
  empty = "No records found.",
  total,
  page: controlledPage,
  pageSize: controlledPageSize,
  onPageChange,
  onPageSizeChange,
}: {
  columns: string[];
  rows: ReactNode[][];
  footer?: ReactNode;
  empty?: string;
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const controlled = controlledPage != null && controlledPageSize != null && total != null;
  const activePage = controlled ? controlledPage : page;
  const activePageSize = controlled ? controlledPageSize : pageSize;
  const recordCount = controlled ? total : rows.length;
  const pageCount = Math.max(1, Math.ceil(recordCount / activePageSize));
  const safePage = Math.min(activePage, pageCount);
  const start = (safePage - 1) * activePageSize;
  const visibleRows = controlled ? rows : rows.slice(start, start + activePageSize);
  const toRow = Math.min(start + visibleRows.length, recordCount);
  useEffect(() => setPage(1), [rows.length, pageSize]);
  const changePage = (next: number) => (controlled ? onPageChange?.(next) : setPage(next));
  const changePageSize = (next: number) => {
    if (controlled) { onPageSizeChange?.(next); onPageChange?.(1); } else setPageSize(next);
  };

  return (
    <div className="flex max-h-[calc(100dvh-16rem)] min-h-[420px] w-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] cc-panel-shadow">
      <div className="min-h-0 w-full flex-1">
        <div className="cc-scroll-region h-full w-full overflow-y-auto overflow-x-auto overscroll-contain">
          <table className="w-full table-fixed border-collapse text-left">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="sticky top-0 z-10 h-9 select-none border-b border-[var(--border-subtle)] bg-[var(--bg-surface-3)] px-3 align-middle text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length ? (
                visibleRows.map((row, i) => (
                  <tr
                    key={start + i}
                    className="h-10 border-b border-[var(--border-subtle)] align-middle transition-colors duration-100 hover:bg-[var(--bg-surface-hover)]"
                  >
                    {row.map((cell, ci) => (
                      <td key={ci} className="break-words px-3 py-1.5 align-middle text-xs text-[var(--text-secondary)]">
                        <div className="min-w-0 whitespace-normal break-words">{cell}</div>
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="h-[350px] text-center align-middle">
                    <div className="mx-auto flex max-w-xs flex-col items-center justify-center space-y-4 p-8">
                      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-3)] p-3 text-[var(--text-tertiary)]">
                        <Inbox className="size-8" aria-hidden />
                      </div>
                      <div className="space-y-1 text-center">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">No data available</h3>
                        <p className="text-xs text-[var(--text-secondary)]">{empty}</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <nav
        aria-label="Table pagination"
        className="z-20 flex shrink-0 flex-col justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 lg:flex-row lg:items-center"
      >
        {footer ?? (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                Showing{" "}
                <span className="font-semibold text-[var(--text-primary)]">{recordCount ? start + 1 : 0}</span> to{" "}
                <span className="font-semibold text-[var(--text-primary)]">{toRow}</span> of{" "}
                <span className="font-semibold text-[var(--text-primary)]">{recordCount}</span> results
              </p>
              <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                Rows per page
                <select
                  aria-label="Rows per page"
                  value={activePageSize}
                  onChange={(e) => changePageSize(Number(e.target.value))}
                  className="h-8 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 font-mono text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  {[10, 25, 50].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-2 self-end lg:self-center">
              <button
                type="button"
                aria-label="Previous page"
                onClick={() => changePage(Math.max(1, safePage - 1))}
                disabled={safePage <= 1}
                className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-1.5 text-[var(--text-secondary)] transition-all duration-150 hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.max(pageCount, 1) }, (_, idx) => idx)
                  .filter((idx) => pageCount <= 7 || idx === 0 || idx === pageCount - 1 || Math.abs(idx - (safePage - 1)) <= 1)
                  .map((idx, pos, arr) => {
                    const isCurrent = idx === safePage - 1;
                    return (
                      <span key={idx} className="contents">
                        {pos > 0 && idx - arr[pos - 1] > 1 ? (
                          <span aria-hidden className="px-1 text-xs text-[var(--text-tertiary)]">â€¦</span>
                        ) : null}
                        <button
                          type="button"
                          aria-label={`Go to page ${idx + 1}`}
                          aria-current={isCurrent ? "page" : undefined}
                          onClick={() => changePage(idx + 1)}
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition-all duration-150",
                            isCurrent
                              ? "bg-[var(--brand-primary)] text-[var(--text-inverse)]"
                              : "border border-transparent text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]"
                          )}
                        >
                          {idx + 1}
                        </button>
                      </span>
                    );
                  })}
              </div>
              <button
                type="button"
                aria-label="Next page"
                onClick={() => changePage(Math.min(pageCount, safePage + 1))}
                disabled={safePage >= pageCount}
                className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-1.5 text-[var(--text-secondary)] transition-all duration-150 hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </>
        )}
      </nav>
    </div>
  );
}

// â”€â”€â”€ AttentionItem types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export type AttentionItem = {
  id: string;
  title: string;
  description?: string;
  count?: number;
  severity?: "info" | "warning" | "critical" | "danger" | "success";
  href: string;
  module?: string;
  entity_id?: string;
  source?: string;
  freshness_at?: string | null;
  category?: string;
  owner?: { id: string; name: string } | null;
  age_seconds?: number;
  status?: "open" | "assigned" | "snoozed" | "resolved";
  version?: number;
};

// â”€â”€â”€ NeedsAttentionPane â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function NeedsAttentionPane({
  items,
  title = "Needs Attention",
  compact = false,
}: {
  items: AttentionItem[];
  title?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const stored = sessionStorage.getItem("organiser-attention-hidden");
    setOpen(stored ? stored !== "true" : window.innerWidth > 1280);
  }, []);
  const hide = () => { sessionStorage.setItem("organiser-attention-hidden", "true"); setOpen(false); };
  const show = () => { sessionStorage.removeItem("organiser-attention-hidden"); setOpen(true); };

  if (!open) {
    return (
      <button
        onClick={show}
        className="op-attention-toggle inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] cc-panel-shadow"
      >
        Tasks{" "}
        <span className="rounded-full bg-[var(--status-warning-muted)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--status-warning)]">
          {items.reduce((t, i) => t + (i.count || 1), 0)}
        </span>
      </button>
    );
  }

  return (
    <aside className={cn("op-attention", compact && "is-compact")}>
      <div className="mb-4 flex items-center justify-between">
        <strong className="text-sm font-semibold text-[var(--text-primary)]">{title}</strong>
        <button
          aria-label="Hide needs attention"
          onClick={hide}
          className="rounded-md p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mb-4 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-3 py-2.5">
        <p className="text-[11px] text-[var(--text-secondary)]">You have</p>
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          {items.reduce((t, i) => t + (i.count || 1), 0)} items that need attention
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {items.length ? (
          items.map((item) => (
            <Link key={item.id} href={item.href}
              className={cn(
                "flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-3 py-2.5 text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-hover)]",
                (item.severity === "critical" || item.severity === "danger") &&
                  "border-[color:var(--status-danger)]/25 bg-[var(--status-danger-muted)]",
                item.severity === "warning" &&
                  "border-[color:var(--status-warning)]/25 bg-[var(--status-warning-muted)]"
              )}
            >
              <span>
                <strong className="block text-xs font-semibold">{item.title}</strong>
                {item.description ? (
                  <small className="mt-0.5 block text-[11px] text-[var(--text-secondary)]">{item.description}</small>
                ) : null}
              </span>
              {typeof item.count === "number" ? (
                <em className="shrink-0 rounded-full bg-[var(--bg-surface-3)] px-2 py-0.5 text-[11px] font-bold not-italic text-[var(--text-secondary)]">
                  {item.count}
                </em>
              ) : (
                <ArrowRight className="size-4 shrink-0 text-[var(--text-tertiary)]" />
              )}
            </Link>
          ))
        ) : (
          <div className="rounded-[var(--radius-control)] bg-[var(--bg-surface-2)] px-3 py-4 text-center text-xs text-[var(--text-secondary)]">
            Everything is on track.
          </div>
        )}
      </div>
      <Link
        href="/dashboard?attention=all"
        className="mt-3 flex h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-hover)]"
      >
        View All Tasks <ArrowRight className="size-4" />
      </Link>
    </aside>
  );
}

// â”€â”€â”€ QuickActions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function QuickActions({ actions }: { actions: Array<{ label: string; href: string; icon?: ReactNode }> }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="flex min-h-[52px] items-center gap-2.5 rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-3 py-2.5 text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-hover)]"
        >
          {action.icon && (
            <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              {action.icon}
            </span>
          )}
          <strong className="text-xs font-semibold">{action.label}</strong>
        </Link>
      ))}
    </div>
  );
}

// â”€â”€â”€ ReadinessRing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function ReadinessRing({ value, label = "Readiness" }: { value: number; label?: string }) {
  const safe = Math.max(0, Math.min(100, Math.round(value || 0)));
  return (
    <div className="op-readiness" style={{ "--op-readiness": `${safe}%` } as CSSProperties}>
      <div className="op-readiness-ring">
        <strong>{safe}%</strong>
      </div>
      <span>{label}</span>
    </div>
  );
}
