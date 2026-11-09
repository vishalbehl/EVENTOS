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

function apiUrl(apiOrigin: string, path: string): string {
  const origin = apiOrigin.replace(/\/$/, "")
  if (/^https?:\/\//i.test(path)) {
    const target = new URL(path)
    if (target.origin !== new URL(origin).origin || target.username || target.password || target.hash) {
      throw new Error("The upload service returned an unsafe status address.")
    }
    return target.href
  }
  const normalized = path.startsWith("/api/v1/") ? path : `/api/v1/${path.replace(/^\//, "")}`
  return `${origin}${normalized}`
}

async function problemError(response: Response, fallback: string): Promise<Error> {
  try {
    const payload = await response.json()
    const detail = payload?.detail
    if (typeof detail === "string") return new Error(detail)
    const message = typeof detail?.message === "string" ? detail.message
      : typeof detail?.code === "string" ? detail.code.replaceAll("_", " ").toLowerCase() : fallback
    return Object.assign(new Error(message), { newAttemptRequired: detail?.code === "UPLOAD_ATTEMPT_CLOSED" })
  } catch {
    // A bounded generic message is safer than exposing an upstream response body.
  }
  return new Error(fallback)
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Upload cancelled", "AbortError"))
      return
    }
    const cancelled = () => {
      window.clearTimeout(timer)
      signal?.removeEventListener("abort", cancelled)
      reject(new DOMException("Upload cancelled", "AbortError"))
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", cancelled)
      resolve()
    }, milliseconds)
    signal?.addEventListener("abort", cancelled, { once: true })
  })
}

export async function uploadPublicRegistrationFile(options: {
  apiOrigin: string
  eventId: string
  fieldName: string
  file: File
  idempotencyKey: string
  signal?: AbortSignal
  onProgress?: (progress: number) => void
}): Promise<ScanGatedUploadAccepted> {
  const body = new FormData()
  body.append("file", options.file)
  body.append("field_name", options.fieldName)
  const response = await fetch(apiUrl(options.apiOrigin,
    `/portal/registration/${encodeURIComponent(options.eventId)}/upload`), {
    method: "POST",
    headers: { "Idempotency-Key": options.idempotencyKey },
    body,
    signal: options.signal,
    credentials: "omit",
    redirect: "error",
  })
  if (!response.ok) {
    throw await problemError(response, "The file could not be accepted for security processing.")
  }
  const accepted = await response.json() as ScanGatedUploadAccepted
  if (!accepted.upload_id || !accepted.capability || !accepted.status_url || !accepted.managed_url) {
    throw new Error("The upload service returned an incomplete processing receipt.")
  }
  const statusAddress = apiUrl(options.apiOrigin, accepted.status_url)
  const statusEndpoint = new URL(statusAddress)
  const expectedStatus = `/api/v1/portal/registration/${encodeURIComponent(options.eventId.toLowerCase())}/uploads/${accepted.upload_id}`
  if (statusEndpoint.pathname !== expectedStatus || statusEndpoint.search || statusEndpoint.hash
      || accepted.managed_url !== `/api/v1/events/${options.eventId.toLowerCase()}/registration/uploads/${accepted.upload_id}/download`) {
    throw new Error("The upload service returned a mismatched processing receipt.")
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const statusResponse = await fetch(statusAddress, {
      method: "GET",
      headers: { "Upload-Capability": accepted.capability },
      signal: options.signal,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
    })
    if (!statusResponse.ok) {
      if (statusResponse.status === 429 || statusResponse.status === 503) {
        const retryAfter = Number(statusResponse.headers.get("Retry-After") || "1")
        await wait(Math.min(10, Math.max(1, retryAfter)) * 1000, options.signal)
        continue
      }
      throw await problemError(statusResponse, "The security-processing status is unavailable.")
    }
    const current = await statusResponse.json() as ScanGatedUploadStatus
    if (current.upload_id !== accepted.upload_id) throw new Error("The upload status does not match this file.")
    options.onProgress?.(Math.max(0, Math.min(100, Number(current.progress) || 0)))
    if (current.status === "ready") return { ...accepted, status: "ready" }
    if (TERMINAL_FAILURES.has(current.status)) {
      throw Object.assign(new Error("The file did not pass security processing. Select it again to start a new attempt."),
        { newAttemptRequired: true })
    }
    await wait(Math.min(5000, 1000 + attempt * 150), options.signal)
  }
  throw new Error("The file is still being processed. Select it again to continue with the same upload receipt.")
}
