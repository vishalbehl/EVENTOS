export function nestedTabRedirect(
  base: string,
  requested: string | string[] | undefined,
  fallback: string,
  aliases: Record<string, string>,
) {
  const raw = Array.isArray(requested) ? requested[0] : requested;
  const normalized = raw?.trim().toLowerCase().replaceAll("_", "-") || fallback;
  const target = aliases[normalized] || fallback;
  return `/${base}/${target}`;
}
