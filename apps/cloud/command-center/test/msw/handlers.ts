import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("http://127.0.0.1:8000/api/v1/health", ({ request }) => {
    const auth = request.headers.get("authorization");
    const requestId = request.headers.get("x-request-id");

    return HttpResponse.json({
      ok: true,
      authorized: Boolean(auth?.startsWith("Bearer ")),
      requestId,
    });
  }),
];
