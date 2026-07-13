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
}

export function DataTable<TData>({
  table,
  ariaLabel = "Data table",
  isLoading = false,
  onRowClick,
  emptyState,
}: DataTableProps<TData>) {
  const columns = table.getAllColumns();
  const rows = table.getRowModel().rows;
  const paginationState = table.getState().pagination;
  const pageIndex = paginationState.pageIndex;
  const pageSize = paginationState.pageSize;
  
  const totalRows = table.getFilteredRowModel().rows.length;
  const fromRow = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const toRow = Math.min(totalRows, (pageIndex + 1) * pageSize);

  const pageCount = table.getPageCount();

  return (
    <div className="space-y-4 w-full">
      <div className="rounded-xl border border-border bg-surface overflow-hidden w-full">
        <div className="w-full overflow-auto max-h-[calc(100vh-420px)] min-h-[300px]">
          <table aria-label={ariaLabel} className="w-full text-left border-collapse">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-border/80">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="sticky top-0 z-10 h-10 px-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] bg-[var(--bg-surface-2)] border-b border-border select-none align-middle"
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
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
                  <tr key={rIdx} className="border-b border-border/40 h-[52px]">
                    {columns.map((col, cIdx) => (
                      <td key={cIdx} className="px-4 py-3 align-middle">
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
                      role={onRowClick ? "button" : undefined}
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
                        "group border-b border-border/40 min-h-[52px] h-[52px] transition-colors duration-100 align-middle",
                        onRowClick && "cursor-pointer hover:bg-surface-hover/50",
                        !onRowClick && "hover:bg-surface-hover/50",
                        isSelected && "bg-[var(--brand-primary-muted)] border-l-2 border-[var(--brand-primary)]"
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-2 text-sm text-[var(--text-secondary)] align-middle">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
      {pageCount > 1 && (
        <div className="rounded-xl border border-border bg-surface px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-xs text-[var(--text-secondary)] font-medium">
            Showing <span className="font-semibold text-[var(--text-primary)]">{fromRow}</span> to{" "}
            <span className="font-semibold text-[var(--text-primary)]">{toRow}</span> of{" "}
            <span className="font-semibold text-[var(--text-primary)]">{totalRows}</span> results
          </p>
          <div className="flex items-center gap-2 self-end sm:self-center">
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
              {Array.from({ length: pageCount }).map((_, idx) => {
                const isCurrent = idx === pageIndex;
                return (
                  <button
                    type="button"
                    aria-label={`Go to page ${idx + 1}`}
                    aria-current={isCurrent ? "page" : undefined}
                    key={idx}
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
        </div>
      )}
    </div>
  );
}
