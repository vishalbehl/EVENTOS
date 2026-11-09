export function describePortalAccessFailure(error: unknown) {
  const response = error && typeof error === "object" && "response" in error
    ? error.response as { status?: number; headers?: Record<string, unknown> } | undefined : undefined;
  const status = response?.status;
  const rawReference = response?.headers?.["x-correlation-id"] ?? response?.headers?.["x-request-id"];
  const referenceId = typeof rawReference === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(rawReference)
    ? rawReference : undefined;
  const rawDelay = response?.headers?.["retry-after"];
  const parsedDelay = typeof rawDelay === "number" || typeof rawDelay === "string" && /^\d+$/.test(rawDelay)
    ? Number(rawDelay) : 0;
  const retryAfterSeconds = Number.isInteger(parsedDelay) && parsedDelay > 0 && parsedDelay <= 86400
    ? parsedDelay : status === 429 ? 60 : 0;
  if (status === 401 || status === 404) return {
    title: "Invalid or expired speaker link",
    message: "Check your invitation email or sign in with your email OTP.", canRetry: false, retryAfterSeconds: 0, referenceId,
  };
  if (status === 403) return {
    title: "Speaker access restricted",
    message: "Contact the organiser to confirm your access to this workspace.", canRetry: false, retryAfterSeconds: 0, referenceId,
  };
  return {
    title: status === 429 ? "Too many requests" : "Speaker workspace temporarily unavailable",
    message: status === 429 ? "Please wait before trying again."
      : "The workspace could not be loaded. Try again later or contact the organiser. This does not mean your link has expired.",
    canRetry: true, retryAfterSeconds, referenceId,
  };
}
