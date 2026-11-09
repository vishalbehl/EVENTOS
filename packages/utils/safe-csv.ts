/** Spreadsheet-safe, RFC-style quoted cells; input remains data, never a formula. */
export function safeCsvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  const risky = /^[\t\r\n]/.test(text) || /^[=+\-@]/.test(text.trimStart());
  return '"' + (risky ? "'" + text : text).replace(/"/g, '""') + '"';
}

export function safeCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map(row => row.map(safeCsvCell).join(",")).join("\r\n");
}
