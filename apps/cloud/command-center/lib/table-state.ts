export interface TableUrlState {
  cursor?: string;
  search?: string;
  sort?: string;
  direction?: "asc" | "desc";
  pageSize: number;
  filters: Record<string, string>;
}

const RESERVED_PARAMS = new Set(["cursor", "search", "sort", "direction", "page_size"]);

export function parseTableUrlState(params: URLSearchParams, defaultPageSize = 25): TableUrlState {
  const parsedSize = Number(params.get("page_size"));
  const direction = params.get("direction");
  const filters: Record<string, string> = {};

  params.forEach((value, key) => {
    if (!RESERVED_PARAMS.has(key) && value) filters[key] = value;
  });

  return {
    cursor: params.get("cursor") || undefined,
    search: params.get("search") || undefined,
    sort: params.get("sort") || undefined,
    direction: direction === "asc" || direction === "desc" ? direction : undefined,
    pageSize: Number.isInteger(parsedSize) && parsedSize > 0 && parsedSize <= 200 ? parsedSize : defaultPageSize,
    filters,
  };
}

export function serializeTableUrlState(state: TableUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.cursor) params.set("cursor", state.cursor);
  if (state.search) params.set("search", state.search);
  if (state.sort) params.set("sort", state.sort);
  if (state.direction) params.set("direction", state.direction);
  params.set("page_size", String(state.pageSize));
  Object.entries(state.filters).sort(([left], [right]) => left.localeCompare(right)).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params;
}

export function resetCursor<T extends TableUrlState>(state: T, patch: Partial<Omit<T, "cursor">>): T {
  return { ...state, ...patch, cursor: undefined };
}
