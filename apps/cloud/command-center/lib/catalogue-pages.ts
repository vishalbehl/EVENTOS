export function appendCataloguePage<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const known = new Set(current.map(item => item.id));
  const additions: T[] = [];
  for (const item of incoming) {
    if (known.has(item.id)) continue;
    known.add(item.id);
    additions.push(item);
  }
  return additions.length ? [...current, ...additions] : current;
}

export function nextCatalogueCursor(
  page: { has_next: boolean; next_cursor?: string | null },
  previous?: string | null,
): string | null {
  if (typeof page.has_next !== "boolean") throw new Error("The catalogue page contract is invalid. Reload before loading more.");
  if (!page.has_next) return null;
  const cursor = page.next_cursor;
  if (typeof cursor !== "string" || !cursor.trim() || cursor.length > 4096 || cursor === previous) {
    throw new Error("The catalogue continuation is invalid. Reload before loading more.");
  }
  return cursor;
}
