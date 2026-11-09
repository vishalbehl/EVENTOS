/** Append a page once, preserving existing loaded records in expected O(n+m). */
export function appendCataloguePage<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const seen = new Set(current.map(item => item.id));
  const added: T[] = [];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    added.push(item);
  }
  return added.length ? [...current, ...added] : current;
}

export function nextCatalogueCursor(page: { has_next: boolean; next_cursor?: string | null }, previous?: string | null): string | null {
  if (typeof page.has_next !== "boolean") throw new Error("The catalogue page contract is invalid. Reload before loading more.");
  if (!page.has_next) return null;
  const cursor = page.next_cursor;
  if (typeof cursor !== "string" || !cursor.trim() || cursor.length > 4096 || cursor === previous) {
    throw new Error("The catalogue returned an invalid continuation. Reload before loading more.");
  }
  return cursor;
}
