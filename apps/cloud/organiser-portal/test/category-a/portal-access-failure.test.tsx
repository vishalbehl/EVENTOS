import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describePortalAccessFailure } from "../../../event-portal/lib/portal-access-failure";
import { PortalAccessFailure } from "../../../event-portal/components/PortalAccessFailure";

afterEach(() => { cleanup(); vi.useRealTimers(); });

it.each([401, 404])("identifies a concealed/expired link for %s without a retry loop", status => {
  expect(describePortalAccessFailure({ response: { status } })).toMatchObject({
    title: "Invalid or expired speaker link", canRetry: false,
  });
});

it.each([503, 500, undefined])("never labels an unavailable workspace as an invalid credential (%s)", status => {
  expect(describePortalAccessFailure({ response: { status, data: { detail: "private-token-should-not-render" } } }))
    .toMatchObject({ title: "Speaker workspace temporarily unavailable", canRetry: true });
});

it("distinguishes denied access and never renders incidental response bodies", () => {
  const retry = vi.fn();
  render(<PortalAccessFailure error={{ response: { status: 403, data: { detail: "sensitive-token" } } }}
    busy={false} onRetry={retry} onSignIn={vi.fn()} />);
  expect(screen.getByText("Speaker access restricted")).toBeTruthy();
  expect(screen.queryByText("sensitive-token")).toBeNull();
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  expect(retry).not.toHaveBeenCalled();
});

it("honours a bounded Retry-After countdown and retries only after an explicit click", () => {
  vi.useFakeTimers();
  const retry = vi.fn();
  render(<PortalAccessFailure error={{ response: { status: 429, headers: { "retry-after": "2" } } }}
    busy={false} onRetry={retry} onSignIn={vi.fn()} />);
  expect((screen.getByRole("button", { name: "Try again in 2s" }) as HTMLButtonElement).disabled).toBe(true);
  act(() => { vi.advanceTimersByTime(1000); });
  act(() => { vi.advanceTimersByTime(1000); });
  expect(retry).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledTimes(1);
});

it.each(["untrusted", "9999999999999999999999", -1, Infinity])("bounds malformed retry delays: %s", value => {
  expect(describePortalAccessFailure({ response: { status: 429, headers: { "retry-after": value } } })
    .retryAfterSeconds).toBe(60);
});

it("shows only bounded tracing references, never URLs or incidental error text", () => {
  render(<PortalAccessFailure error={{ response: { status: 503, headers: { "x-correlation-id": "trace_fixture-123" } } }}
    busy={false} onRetry={vi.fn()} onSignIn={vi.fn()} />);
  expect(screen.getByText("Reference: trace_fixture-123")).toBeTruthy();
  expect(describePortalAccessFailure({ response: { status: 503, headers: { "x-request-id": "https://private.invalid/token" } } })
    .referenceId).toBeUndefined();
});
