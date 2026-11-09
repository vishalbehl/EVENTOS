import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import ProgrammeAccessPage from "@/app/programme/[token]/page";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "synthetic-reviewer-token" }),
  useRouter: () => navigation,
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("opens the detailed rubric workspace without loading or submitting the obsolete empty-score form", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    audience: "REVIEWER", event_id: "synthetic-event", expires_at: "2026-10-23T12:00:00Z",
  }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  render(<ProgrammeAccessPage />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(
    "/synthetic-event/review/synthetic-reviewer-token"));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Submit review" })).toBeNull();
});

it("does not redirect a reviewer grant without its event identity", async () => {
  navigation.replace.mockClear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    audience: "REVIEWER", expires_at: "2026-10-23T12:00:00Z",
  }), { status: 200 })));
  render(<ProgrammeAccessPage />);
  expect(await screen.findByText("The reviewer workspace is unavailable.")).toBeTruthy();
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Submit review" })).toBeNull();
});
