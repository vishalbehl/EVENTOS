"use client";

import React from "react";
import { Table as TableType, flexRender } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Inbox, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface DataTableProps<TData> {
  table: TableType<TData>;
  ariaLabel?: string;
  isLoading?: boolean;
  onRowClick?: (row: TData) => void;
  emptyState?: {
    icon?: React.ComponentType<{ className?: string }>;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
  };
  totalRows?: number;
}

export function DataTable<TData>({
  table,
  ariaLabel = "Data table",
  isLoading = false,
  onRowClick,
  emptyState,
  totalRows: totalRowsProp,
}: DataTableProps<TData>) {
  const columns = table.getAllColumns();
  const rows = table.getRowModel().rows;
  const paginationState = table.getState().pagination;
  const pageIndex = paginationState.pageIndex;
  const pageSize = paginationState.pageSize;
  
  const totalRows = totalRowsProp ?? table.getFilteredRowModel().rows.length;
  const fromRow = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const toRow = Math.min(totalRows, (pageIndex + 1) * pageSize);

  const pageCount = table.getPageCount();

  return (
    <div className="flex min-h-[420px] max-h-[calc(100dvh-16rem)] w-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-panel)]">
      <div className="min-h-0 w-full flex-1">
        <div className="cc-scroll-region h-full w-full overflow-y-auto overflow-x-hidden overscroll-contain">
          <table aria-label={ariaLabel} aria-busy={isLoading} className="w-full table-fixed border-collapse text-left">
            <caption className="sr-only">{ariaLabel}</caption>
            <colgroup>
              {table.getVisibleLeafColumns().map((column) => <col key={column.id} style={column.id === "select" ? { width: 40 } : column.id === "actions" ? { width: 48 } : column.id === "name" ? { width: "24%" } : undefined} />)}
            </colgroup>
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-border/80">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="sticky top-0 z-10 h-9 select-none border-b border-[var(--border-subtle)] bg-[var(--bg-surface-3)] px-2 align-middle text-[10px] font-semibold text-[var(--text-tertiary)] sm:px-3"
                    >
                      {header.isPlaceholder ? null : (
                        header.column.columnDef.header == null || header.column.columnDef.header === ""
                          ? <span className="sr-only">{header.column.id === "actions" ? "Actions" : header.column.id}</span>
                          : flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                // Shimmer Skeleton State
                Array.from({ length: Math.max(rows.length, 5) }).map((_, rIdx) => (
                <tr key={rIdx} className="h-10 border-b border-border/40">
                    {columns.map((col, cIdx) => (
                      <td key={cIdx} className="px-2 py-1.5 align-middle sm:px-3">
                        <div className="h-4 bg-surface-2 animate-pulse rounded-md w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                // Empty state
                <tr>
                  <td colSpan={columns.length} className="h-[350px] text-center align-middle">
                    <div className="flex flex-col items-center justify-center p-8 max-w-md mx-auto space-y-4">
                      <div className="p-3 bg-surface-2 rounded-2xl text-[var(--text-tertiary)]">
                        {emptyState?.icon ? (
                          <emptyState.icon className="w-8 h-8" />
                        ) : (
                          <Inbox className="w-8 h-8" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-base font-semibold text-[var(--text-primary)]">
                          {emptyState?.title || "No data available"}
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {emptyState?.description || "There are no records found for this view."}
                        </p>
                      </div>
                      {emptyState?.actionLabel && emptyState?.onAction && (
                        <button
                          onClick={emptyState.onAction}
                          className="px-4 py-2 rounded-xl bg-[var(--brand-primary)] text-[var(--primary-foreground)] text-xs font-semibold hover:bg-[var(--brand-primary-hover)] transition-all duration-200"
                        >
                          {emptyState.actionLabel}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isSelected = row.getIsSelected();
                  return (
                    <tr
                      key={row.id}
                      tabIndex={onRowClick ? 0 : undefined}
                      aria-selected={isSelected || undefined}
                      data-state={isSelected ? "selected" : undefined}
                      onClick={() => onRowClick?.(row.original)}
                      onKeyDown={(event) => {
                        if (onRowClick && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          onRowClick(row.original);
                        }
                      }}
                      className={cn(
                        "group h-10 border-b border-border/40 align-middle transition-colors duration-100",
                        onRowClick && "cursor-pointer hover:bg-surface-hover/50",
                        !onRowClick && "hover:bg-surface-hover/50",
                        isSelected && "bg-[var(--brand-primary-muted)] border-l-2 border-[var(--brand-primary)]"
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="break-words px-2 py-1.5 align-middle text-xs text-[var(--text-secondary)] sm:px-3">
                          <div className="min-w-0 whitespace-normal break-words">{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination row as a separate card below the table canvas */}
      <nav aria-label={`${ariaLabel} pagination`} className="z-20 flex shrink-0 flex-col justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 shadow-[0_-8px_24px_rgb(var(--shadow-color)/.08)] lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-center gap-4">
          <p className="text-xs text-[var(--text-secondary)] font-medium">
            Showing <span className="font-semibold text-[var(--text-primary)]">{fromRow}</span> to{" "}
            <span className="font-semibold text-[var(--text-primary)]">{toRow}</span> of{" "}
            <span className="font-semibold text-[var(--text-primary)]">{totalRows}</span> results
          </p>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            Rows per page
            <select value={pageSize} onChange={(event) => table.setPagination({ pageIndex: 0, pageSize: Number(event.target.value) })} className="h-8 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 font-mono text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          </div>
          <div className="flex items-center gap-2 self-end lg:self-center">
            {/* Prev button */}
            <button
              type="button"
              aria-label="Previous page"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="p-1.5 rounded-lg border border-border bg-surface text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-surface disabled:hover:text-[var(--text-secondary)] transition-all duration-150"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Page number buttons */}
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.max(pageCount, 1) }).map((_, idx) => idx).filter((idx) => pageCount <= 7 || idx === 0 || idx === pageCount - 1 || Math.abs(idx - pageIndex) <= 1).map((idx, position, visiblePages) => {
                const isCurrent = idx === pageIndex;
                return (
                  <React.Fragment key={idx}>
                  {position > 0 && idx - visiblePages[position - 1] > 1 ? <span aria-hidden className="px-1 text-xs text-[var(--text-tertiary)]">…</span> : null}
                  <button
                    type="button"
                    aria-label={`Go to page ${idx + 1}`}
                    aria-current={isCurrent ? "page" : undefined}
                    onClick={() => table.setPageIndex(idx)}
                    className={cn(
                      "w-7 h-7 text-xs font-semibold rounded-lg flex items-center justify-center transition-all duration-150",
                      isCurrent
                        ? "bg-[var(--brand-primary)] text-[var(--primary-foreground)]"
                        : "text-[var(--text-secondary)] hover:bg-surface-2 hover:text-[var(--text-primary)] border border-transparent hover:border-border"
                    )}
                  >
                    {idx + 1}
                  </button>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Next button */}
            <button
              type="button"
              aria-label="Next page"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="p-1.5 rounded-lg border border-border bg-surface text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-surface disabled:hover:text-[var(--text-secondary)] transition-all duration-150"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </nav>
    </div>
  );
}
