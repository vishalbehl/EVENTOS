"use client";

import React from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export interface TablePaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
  className?: string;
}

export function TablePagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  itemLabel = "items",
  className = "",
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, totalItems);

  // Generate intelligent page pill numbers with ellipsis
  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | "...")[] = [];
    pages.push(1);

    if (safePage > 3) {
      pages.push("...");
    }

    const startWindow = Math.max(2, safePage - 1);
    const endWindow = Math.min(totalPages - 1, safePage + 1);

    for (let p = startWindow; p <= endWindow; p++) {
      pages.push(p);
    }

    if (safePage < totalPages - 2) {
      pages.push("...");
    }

    pages.push(totalPages);
    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-2)]/40 text-xs ${className}`}
    >
      {/* Left side: Rows per page selector + Showing record counter */}
      <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
              Show:
            </span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Items per page"
              className="h-8 px-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-xs font-bold text-[var(--text-primary)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--pri)]/20 cursor-pointer"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <span className="text-[11px] font-semibold text-[var(--text-tertiary)]">
              / page
            </span>
          </div>
        )}

        <div className="text-[11px] font-medium text-[var(--text-secondary)]">
          Showing{" "}
          <span className="font-bold text-[var(--text-primary)]">{start}</span>–
          <span className="font-bold text-[var(--text-primary)]">{end}</span> of{" "}
          <span className="font-bold text-[var(--text-primary)]">{totalItems}</span>{" "}
          {itemLabel}
        </div>
      </div>

      {/* Right side: Page Navigation buttons */}
      <div className="flex items-center gap-1">
        {/* First Page */}
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={safePage <= 1}
          aria-label="First page"
          title="First page"
          className="p-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm"
        >
          <ChevronsLeft className="size-4" />
        </button>

        {/* Previous Page */}
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          aria-label="Previous page"
          title="Previous page"
          className="p-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm"
        >
          <ChevronLeft className="size-4" />
        </button>

        {/* Page numbers */}
        <div className="flex items-center gap-1 mx-1">
          {pageNumbers.map((p, idx) => {
            if (p === "...") {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="px-1.5 text-xs text-[var(--text-tertiary)] font-bold select-none"
                >
                  …
                </span>
              );
            }

            const isActive = p === safePage;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-label={`Page ${p}`}
                aria-current={isActive ? "page" : undefined}
                className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-sm ${
                  isActive
                    ? "bg-[var(--pri)] text-white border border-[var(--pri)] shadow-[var(--pri)]/20 shadow-md"
                    : "border border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        {/* Next Page */}
        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages}
          aria-label="Next page"
          title="Next page"
          className="p-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm"
        >
          <ChevronRight className="size-4" />
        </button>

        {/* Last Page */}
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={safePage >= totalPages}
          aria-label="Last page"
          title="Last page"
          className="p-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm"
        >
          <ChevronsRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
