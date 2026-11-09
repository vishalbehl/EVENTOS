"use client";

export type CapacityField = {
  key: string;
  label: string;
  unit: string;
};

export function EnterpriseCapacityEditor({
  fields,
  values,
  notes,
  onValueChange,
  onNotesChange,
}: {
  fields: CapacityField[];
  values: Record<string, string>;
  notes: string;
  onValueChange: (key: string, value: string) => void;
  onNotesChange: (value: string) => void;
}) {
  return (
    <fieldset className="mt-5 overflow-hidden rounded-xl border border-[var(--acc)]/40 bg-[var(--bg-surface)]">
      <legend className="sr-only">Requested enterprise allocation</legend>
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--acc)]">Allocation brief</p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">Set the capacity that should be priced and locked into the approved quote.</p>
      </div>
      <div className="grid gap-px bg-[var(--border-subtle)] sm:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => (
          <label key={field.key} className="bg-[var(--bg-surface)] p-4 text-xs text-[var(--text-secondary)]">
            <span className="font-medium text-[var(--text-primary)]">{field.label}</span>
            <span className="mt-0.5 block">{field.unit}</span>
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={values[field.key] ?? ""}
              onChange={(event) => onValueChange(field.key, event.target.value)}
              placeholder="Enter quantity"
              className="input mt-2 h-10 w-full rounded-md px-3 text-sm"
            />
          </label>
        ))}
      </div>
      <label className="block border-t border-[var(--border-subtle)] p-4 text-xs text-[var(--text-secondary)]">
        Requirements and commercial notes
        <textarea
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Service levels, reporting, support, contract terms, or other requirements"
          className="input mt-2 min-h-20 w-full rounded-md px-3 py-2 text-sm"
        />
      </label>
    </fieldset>
  );
}

