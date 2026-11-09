import type { CatalogueReconciliationRunStatus } from "@/services/form-template-service";

type Progress = Pick<CatalogueReconciliationRunStatus, "status"> & Partial<Pick<
  CatalogueReconciliationRunStatus, "completion_status" | "streams_total" | "streams_completed"
>>;

export function catalogueCompletion(progress: Progress): "FAILED" | "LEGACY_UNTRACKED" | "COMPLETED" | "PENDING" {
  if (progress.status === "FAILED" || progress.completion_status === "FAILED") return "FAILED";
  if (progress.completion_status === "LEGACY_UNTRACKED" ||
      progress.status === "DISPATCHED" && !progress.completion_status) return "LEGACY_UNTRACKED";
  if (progress.status === "DISPATCHED" && progress.completion_status === "COMPLETED" &&
      Number.isSafeInteger(progress.streams_total) && (progress.streams_total ?? 0) > 0 &&
      progress.streams_completed === progress.streams_total) return "COMPLETED";
  return "PENDING";
}
