export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
  previous_cursor?: string | null;
  total?: number;
  page_size: number;
}

export interface CursorQuery {
  cursor?: string;
  page_size?: number;
  sort?: string;
  search?: string;
}

export function isCursorPage<T>(value: unknown): value is CursorPage<T> {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<CursorPage<T>>;
  return Array.isArray(page.items) && typeof page.page_size === "number" &&
    (page.next_cursor === null || typeof page.next_cursor === "string");
}
