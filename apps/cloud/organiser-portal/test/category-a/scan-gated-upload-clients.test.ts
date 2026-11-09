// Client protocol tests only; connected DB/provider/worker proof is separate.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadAndWaitForScan, requiresNewUploadAttempt as organiserRequiresNewAttempt } from "@/services/scan-gated-upload-service";
import { uploadPublicRegistrationFile, requiresNewUploadAttempt as publicRequiresNewAttempt } from "../../../event-portal/lib/scan-gated-registration-upload";

const api = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiClient: api }));

const eventId = "11111111-1111-4111-8111-111111111111";
const uploadId = "22222222-2222-4222-8222-222222222222";
const receipt = {
  status: "processing", upload_id: uploadId, filename: "proof.pdf", capability: "unit-test-capability",
  status_url: `/api/v1/portal/registration/${eventId}/uploads/${uploadId}`,
  managed_url: `/api/v1/events/${eventId}/registration/uploads/${uploadId}/download`,
};
const fetcher = vi.fn();

function configure(statuses: string[], accepted = receipt, wrongId = false) {
  api.post.mockResolvedValue(accepted);
  let reads = 0;
  api.get.mockImplementation(async () => ({ upload_id: wrongId ? "foreign-upload" : uploadId,
    status: statuses[Math.min(reads++, statuses.length - 1)], progress: 65 }));
  fetcher.mockImplementation(async (_url, options) => {
    const payload = options?.method === "POST" ? accepted : await api.get();
    return new Response(JSON.stringify(payload), { status: options?.method === "POST" ? 202 : 200 });
  });
}

function start(client: string, signal?: AbortSignal) {
  const options = { eventId, file: new File(["%PDF-1.4"], "proof.pdf", { type: "application/pdf" }),
    fieldName: "document", idempotencyKey: "stable-client-upload-key", signal };
  return client === "public"
    ? uploadPublicRegistrationFile({ ...options, apiOrigin: "http://127.0.0.1:18080" })
    : uploadAndWaitForScan(options);
}

beforeEach(() => {
  vi.useFakeTimers();
  api.get.mockReset(); api.post.mockReset(); fetcher.mockReset();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe.each(["public", "organiser"])("%s scan-gated client", client => {
  it("returns only after READY and removes completed timer listeners", async () => {
    configure(["scanning", "ready"]);
    const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, "removeEventListener");
    let finished = false;
    const promise = start(client, controller.signal).then(value => { finished = true; return value; });
    await vi.advanceTimersByTimeAsync(0);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toMatchObject({ upload_id: uploadId, status: "ready" });
    expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    if (client === "public") {
      expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"]).toBe("stable-client-upload-key");
      expect(fetcher.mock.calls[0][1].redirect).toBe("error");
      expect(fetcher.mock.calls[1][1].headers["Upload-Capability"]).toBe(receipt.capability);
      expect(fetcher.mock.calls[1][1].redirect).toBe("error");
    } else {
      expect(api.post.mock.calls[0][2].headers["Idempotency-Key"]).toBe("stable-client-upload-key");
    }
  });

  it.each(["failed", "quarantined", "deleted", "cleanup_pending"])("never accepts %s as a finished upload", async status => {
    configure([status]);
    const promise = start(client);
    await expect(promise).rejects.toThrow("security processing");
    await expect(promise).rejects.toMatchObject({ newAttemptRequired: true });
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [409, "UPLOAD_ATTEMPT_CLOSED", true],
    [409, "UPLOAD_OBJECT_CONFLICT", false],
    [409, "UPLOAD_RECOVERY_IN_PROGRESS", false],
    [503, "REGISTRATION_STORAGE_UNAVAILABLE", false],
    [429, "RATE_LIMITED", false],
    [404, "UPLOAD_NOT_FOUND", false],
  ] as const)("rotates only a confirmed closed receipt, not %s/%s", async (status, code, closed) => {
    api.post.mockRejectedValue({ status, code, message: "Upload cannot proceed" });
    fetcher.mockResolvedValue(new Response(JSON.stringify({ detail: { code, message: "Upload cannot proceed" } }), { status }));
    const error = await start(client).catch(problem => problem);
    const requires = client === "public" ? publicRequiresNewAttempt : organiserRequiresNewAttempt;
    expect(requires(error)).toBe(closed);
    expect(api.get).not.toHaveBeenCalled();
    expect(client === "public" ? fetcher : api.post).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects mismatched status identity even if it claims READY", async () => {
    configure(["ready"], receipt, true);
    await expect(start(client)).rejects.toThrow("does not match this file");
  });

  it("rejects a cross-origin status address before sending the capability", async () => {
    configure(["ready"], { ...receipt, status_url: "https://foreign.example/status" });
    await expect(start(client)).rejects.toThrow(/unsafe status|mismatched processing/);
    expect(api.get).not.toHaveBeenCalled();
    if (client === "public") expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending poll without retaining listeners or retrying the upload", async () => {
    configure(["processing"]);
    const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, "removeEventListener");
    const promise = start(client, controller.signal);
    const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(client === "public" ? fetcher.mock.calls.filter(call => call[1]?.method === "POST").length : api.post.mock.calls.length).toBe(1);
  });
});
