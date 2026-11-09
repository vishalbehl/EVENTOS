import { useState, useMemo, useEffect, useRef } from "react";

export interface UseTablePaginationOptions {
  initialPageSize?: number;
  initialPage?: number;
}

export function useTablePagination<T>(
  items: T[],
  initialPageSize: number = 10,
  options?: UseTablePaginationOptions
) {
  const defaultPageSize = options?.initialPageSize ?? initialPageSize;
  const [currentPage, setCurrentPage] = useState(options?.initialPage ?? 1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // If items length decreases and current page exceeds total pages, move to last valid page
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // Reset to page 1 when data items length changes (e.g. search / filter applied)
  const prevLengthRef = useRef(totalItems);
  useEffect(() => {
    if (prevLengthRef.current !== totalItems) {
      setCurrentPage(1);
      prevLengthRef.current = totalItems;
    }
  }, [totalItems]);

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  const paginatedItems = useMemo(() => {
    return items.slice(startIndex, endIndex);
  }, [items, startIndex, endIndex]);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  return {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize: handlePageSizeChange,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
    paginatedItems,
  };
}
