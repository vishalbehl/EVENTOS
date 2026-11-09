import { apiClient } from "@/lib/api-client"

export type ScanGatedUploadAccepted = {
  status: string
  upload_id: string
  filename: string
  capability: string
  managed_url: string
  status_url: string
}

type ScanGatedUploadStatus = {
  upload_id: string
  status: string
  progress: number
  filename: string
  download_url?: string | null
}

const TERMINAL_FAILURES = new Set(["failed", "quarantined", "deleted", "cleanup_pending"])

export function requiresNewUploadAttempt(error: unknown): boolean {
  return typeof error === "object" && error !== null && "newAttemptRequired" in error && error.newAttemptRequired === true
}

function apiPath(path: string): string {
  return path.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/api\/v1(?=\/)/, "")
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Upload monitoring was cancelled", "AbortError"))
      return
    }
    const cancelled = () => {
      window.clearTimeout(timer)
      signal?.removeEventListener("abort", cancelled)
      reject(new DOMException("Upload monitoring was cancelled", "AbortError"))
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", cancelled)
      resolve()
    }, milliseconds)
    signal?.addEventListener("abort", cancelled, { once: true })
  })
}

export async function uploadAndWaitForScan(options: {
  eventId: string
  file: File
  fieldName?: string
  staffProgram?: boolean
  idempotencyKey?: string
  signal?: AbortSignal
  onProgress?: (progress: number) => void
}): Promise<ScanGatedUploadAccepted> {
  const body = new FormData()
  body.append("file", options.file)
  if (options.fieldName) body.append("field_name", options.fieldName)
  const key = options.idempotencyKey || crypto.randomUUID()
  const endpoint = options.staffProgram
    ? `/events/${options.eventId}/registration/program-upload`
    : `/portal/registration/${options.eventId}/upload`
  let accepted: ScanGatedUploadAccepted
  try {
    accepted = await apiClient.post<ScanGatedUploadAccepted>(endpoint, body, {
      headers: { "Content-Type": undefined, "Idempotency-Key": key } as any,
      signal: options.signal,
    })
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "UPLOAD_ATTEMPT_CLOSED") {
      throw Object.assign(new Error("This upload attempt is closed. Select the file again to start a new attempt."),
        { newAttemptRequired: true })
    }
    throw error
  }
  const expectedStatus = `/api/v1/portal/registration/${options.eventId.toLowerCase()}/uploads/${accepted.upload_id}`
  const expectedManaged = options.staffProgram
    ? `/api/v1/public/events/${options.eventId.toLowerCase()}/registration-documents/${accepted.upload_id}`
    : `/api/v1/events/${options.eventId.toLowerCase()}/registration/uploads/${accepted.upload_id}/download`
  if (!accepted.upload_id || !accepted.capability || accepted.status_url !== expectedStatus
      || accepted.managed_url !== expectedManaged) {
    throw new Error("The upload service returned a mismatched processing receipt.")
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const current = await apiClient.get<ScanGatedUploadStatus>(apiPath(accepted.status_url), {
      headers: { "Upload-Capability": accepted.capability },
      signal: options.signal,
    })
    if (current.upload_id !== accepted.upload_id) throw new Error("The upload status does not match this file.")
    options.onProgress?.(current.progress)
    if (current.status === "ready") return { ...accepted, status: "ready" }
    if (TERMINAL_FAILURES.has(current.status)) {
      throw Object.assign(new Error("The uploaded file did not pass security processing. Select it again to start a new attempt."),
        { newAttemptRequired: true })
    }
    await delay(Math.min(5000, 1000 + attempt * 150), options.signal)
  }
  throw new Error("The file is still being processed. Retry with the same upload key.")
}
