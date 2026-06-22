"use client";

type FeatureSpec = {
  category: string;
  feature: string;
  value: string;
};

export function AddonFeatureDetails({ specs }: { specs: FeatureSpec[] }) {
  const groups = specs.reduce<Record<string, FeatureSpec[]>>((acc, spec) => {
    const key = spec.category || "Additional Features";
    acc[key] ||= [];
    acc[key].push(spec);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([category, items]) => (
        <div
          key={category}
          className="rounded-2xl border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--text)_3%,transparent)] p-4"
        >
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--text)]">
            {category}
          </p>
          <div className="mt-3 space-y-2">
            {items.map((item, index) => (
              <div
                key={`${item.feature}-${index}`}
                className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_6%,transparent)] px-3 py-2"
              >
                <span className="text-sm font-semibold text-[var(--text)]">{item.feature}</span>
                <span className="text-sm font-bold text-[var(--sec)]">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
