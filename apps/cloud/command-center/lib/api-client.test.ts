import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpResponse, http } from "msw";

import { server } from "@/test/msw/server";

const authState = {
  user: {
    id: "user_1",
    email: "admin@example.com",
    first_name: "Ada",
    last_name: "Minerva",
    role: "platform_admin",
    organization_id: "org_1",
  },
  accessToken: "access-token",
  refreshToken: "refresh-token",
  rememberMe: true,
  setAuth: vi.fn(),
  logout: vi.fn(),
  updateActivity: vi.fn(),
};

vi.mock("@/store/use-auth-store", () => ({
  useAuthStore: {
    getState: () => authState,
  },
}));

describe("apiClient", () => {
  beforeEach(() => {
    authState.setAuth.mockReset();
    authState.logout.mockReset();
    authState.updateActivity.mockReset();
  });

  it("adds auth headers and request metadata to requests", async () => {
    server.use(
      http.get("http://127.0.0.1:8000/api/v1/health", ({ request }) => {
        return HttpResponse.json({
          authorized: request.headers.get("authorization"),
          requestId: request.headers.get("x-request-id"),
          correlationId: request.headers.get("x-correlation-id"),
        });
      }),
    );

    const { apiGet } = await import("./api-client");
    const result = await apiGet<{ authorized: string | null; requestId: string | null; correlationId: string | null }>("/health");

    expect(result.authorized).toBe("Bearer access-token");
    expect(result.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.correlationId).toEqual(result.requestId);
    expect(authState.updateActivity).toHaveBeenCalled();
  });

  it("preserves an explicit authorization header for bounded session operations", async () => {
    server.use(
      http.post("http://127.0.0.1:8000/api/v1/auth/logout", ({ request }) =>
        HttpResponse.json({ authorization: request.headers.get("authorization") }),
      ),
    );

    const { apiPost } = await import("./api-client");
    const result = await apiPost<{ authorization: string | null }>("/auth/logout", undefined, {
      headers: { Authorization: "Bearer bounded-token" },
    });

    expect(result.authorization).toBe("Bearer bounded-token");
  });

  it("maps problem responses into ApiError with a stable code", async () => {
    server.use(
      http.get("http://127.0.0.1:8000/api/v1/health", () => {
        return HttpResponse.json(
          {
            title: "Rate limited",
            detail: "Try again later.",
            code: "RATE_LIMITED",
          },
          { status: 429, headers: { "x-request-id": "req_123", "x-correlation-id": "corr_456" } },
        );
      }),
    );

    const { apiGet, ApiError } = await import("./api-client");

    await expect(apiGet("/health")).rejects.toBeInstanceOf(ApiError);

    try {
      await apiGet("/health");
    } catch (error) {
      const apiError = error as InstanceType<typeof ApiError>;
      expect(apiError.status).toBe(429);
      expect(apiError.code).toBe("RATE_LIMITED");
      expect(apiError.requestId).toBe("req_123");
      expect(apiError.correlationId).toBe("corr_456");
      expect(apiError.retryable).toBe(true);
    }
  });

  it("refreshes once and replays a request with the rotated token", async () => {
    let attempts = 0;
    server.use(
      http.get("http://127.0.0.1:8000/api/v1/protected", ({ request }) => {
        attempts += 1;
        if (attempts === 1) return HttpResponse.json({ detail: "Expired" }, { status: 401 });
        return HttpResponse.json({ authorization: request.headers.get("authorization") });
      }),
      http.post("http://127.0.0.1:8000/api/v1/auth/refresh", () =>
        HttpResponse.json({ access_token: "rotated-token", refresh_token: "rotated-refresh", token_type: "bearer" }),
      ),
    );

    const { apiGet } = await import("./api-client");
    await expect(apiGet<{ authorization: string }>("/protected")).resolves.toEqual({ authorization: "Bearer rotated-token" });
    expect(attempts).toBe(2);
    expect(authState.setAuth).toHaveBeenCalledWith(authState.user, "rotated-token", "rotated-refresh", true);
  });

  it("parses plain and encoded download filenames", async () => {
    const { parseDownloadFilename } = await import("./api-client");
    expect(parseDownloadFilename("attachment; filename=events.csv")).toBe("events.csv");
    expect(parseDownloadFilename("attachment; filename*=UTF-8''event%20report.csv")).toBe("event report.csv");
  });
});
