import { Skeleton } from "@/components/ui/skeleton";

export default function CommandCenterLoading() {
  return (
    <div className="space-y-4 px-[var(--space-page-x)] py-[var(--space-page-y)]" aria-label="Loading command center">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}
