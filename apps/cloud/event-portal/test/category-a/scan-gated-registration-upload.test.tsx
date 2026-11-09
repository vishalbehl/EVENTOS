import { afterEach, describe, expect, it, vi } from "vitest"

import {
  requiresNewUploadAttempt,
  uploadPublicRegistrationFile,
} from "@/lib/scan-gated-registration-upload"

const eventId = "11111111-1111-4111-8111-111111111111"
const uploadId = "22222222-2222-4222-8222-222222222222"
const statusPath = `/api/v1/portal/registration/${eventId}/uploads/${uploadId}`
const managedPath = `/api/v1/events/${eventId}/registration/uploads/${uploadId}/download`

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response
}

function accepted(overrides: Record<string, unknown> = {}) {
  return {
    status: "processing",
    upload_id: uploadId,
    filename: "evidence.pdf",
    capability: "opaque-capability",
    status_url: statusPath,
    managed_url: managedPath,
    ...overrides,
  }
}

function options(overrides: Record<string, unknown> = {}) {
  return {
    apiOrigin: "https://api.example.test",
    eventId,
    fieldName: "supporting_document",
    file: new File(["bounded"], "evidence.pdf", { type: "application/pdf" }),
    idempotencyKey: "stable-retry-key",
    ...overrides,
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("scan-gated public registration uploads", () => {
  it("returns only after the controlled status endpoint reports ready", async () => {
    const progress = vi.fn()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(accepted()))
      .mockResolvedValueOnce(jsonResponse({
        upload_id: uploadId,
        status: "ready",
        progress: 140,
        filename: "evidence.pdf",
        download_url: managedPath,
      }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await uploadPublicRegistrationFile(options({ onProgress: progress }))

    expect(result).toMatchObject({ upload_id: uploadId, status: "ready", managed_url: managedPath })
    expect(progress).toHaveBeenCalledExactlyOnceWith(100)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.example.test/api/v1/portal/registration/${eventId}/upload`)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: { "Idempotency-Key": "stable-retry-key" },
      credentials: "omit",
      redirect: "error",
    })
    expect(fetchMock.mock.calls[1]).toEqual([
      `https://api.example.test${statusPath}`,
      expect.objectContaining({
        method: "GET",
        headers: { "Upload-Capability": "opaque-capability" },
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
      }),
    ])
  })

  it.each([
    ["foreign status origin", { status_url: `https://attacker.example/${uploadId}` }],
    ["status query", { status_url: `${statusPath}?leak=true` }],
    ["different event", { status_url: statusPath.replace(eventId, "33333333-3333-4333-8333-333333333333") }],
    ["provider download", { managed_url: "https://storage.example/object?signature=long-lived" }],
  ])("rejects a %s before polling", async (_name, overrides) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(accepted(overrides)))
    vi.stubGlobal("fetch", fetchMock)

    await expect(uploadPublicRegistrationFile(options())).rejects.toThrow(/unsafe status address|mismatched processing receipt/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("rejects a status response for another upload", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(accepted()))
      .mockResolvedValueOnce(jsonResponse({
        upload_id: "44444444-4444-4444-8444-444444444444",
        status: "ready",
        progress: 100,
        filename: "foreign.pdf",
      }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(uploadPublicRegistrationFile(options())).rejects.toThrow("does not match this file")
  })

  it.each(["failed", "quarantined", "deleted", "cleanup_pending"])(
    "requires a new attempt after terminal status %s",
    async status => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(jsonResponse(accepted()))
        .mockResolvedValueOnce(jsonResponse({ upload_id: uploadId, status, progress: 100, filename: "evidence.pdf" }))
      vi.stubGlobal("fetch", fetchMock)

      const error = await uploadPublicRegistrationFile(options()).catch(value => value)
      expect(error).toBeInstanceOf(Error)
      expect(requiresNewUploadAttempt(error)).toBe(true)
    },
  )

  it("honours bounded Retry-After before explicitly polling again", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(accepted()))
      .mockResolvedValueOnce(jsonResponse({ detail: { code: "RATE_LIMITED" } }, 429, { "Retry-After": "999" }))
      .mockResolvedValueOnce(jsonResponse({ upload_id: uploadId, status: "ready", progress: 100, filename: "evidence.pdf" }))
    vi.stubGlobal("fetch", fetchMock)

    const resultPromise = uploadPublicRegistrationFile(options())
    await vi.advanceTimersByTimeAsync(9_999)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)

    await expect(resultPromise).resolves.toMatchObject({ status: "ready" })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("does not expose an incomplete acceptance receipt", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(accepted({ capability: "" })))
    vi.stubGlobal("fetch", fetchMock)

    await expect(uploadPublicRegistrationFile(options())).rejects.toThrow("incomplete processing receipt")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
