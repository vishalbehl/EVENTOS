import React from "react";
import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ReviewerWorkspace from "@/app/[eventId]/review/[token]/page";

const notice = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ eventId: "fixture-event", token: "fixture-reviewer" }),
  useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/toast", () => ({ toast: notice }));
afterEach(() => {
  cleanup();
  notice.error.mockReset();
  notice.success.mockReset();
  vi.unstubAllGlobals();
});

function assignment(status = "PENDING") {
  return { id: "fixture-assignment", submission_id: "fixture-submission", code: "R-1", title: "Fixture abstract",
    submission_version: 3, abstract_type: "ORAL", status, conflict_declared: false, anonymous: true,
    rubric: [{ key: "quality", label: "Quality", max: 10 }],
    ...(status === "COMPLETED" ? { scores: { quality: 7 }, recommendation: "ACCEPT", total_score: 7 } : {}) };
}

it("retains review input and reuses the same receipt on an explicit retry after throttling", async () => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("TextEncoder", TextEncoder);
  const posts: RequestInit[] = [];
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      posts.push(init);
      return posts.length === 1
        ? new Response(JSON.stringify({ detail: { message: "Please wait." } }), { status: 429, headers: { "Retry-After": "2" } })
        : new Response(JSON.stringify({ review_id: "fixture-review" }), { status: 200 });
    }
    return new Response(JSON.stringify([assignment()]), { status: 200 });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<ReviewerWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: "Score Abstract" }));
  fireEvent.change(screen.getByRole("slider", { name: "Quality" }), { target: { value: "7" } });
  const comments = screen.getByRole("textbox", { name: "Confidential Comments to Programme Committee" });
  fireEvent.change(comments, { target: { value: "Retain this private draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Save & Finalize Review" }));
  await waitFor(() => expect(notice.error).toHaveBeenCalledWith("Please wait. Retry after 2 seconds."));
  expect(posts).toHaveLength(1);
  expect((comments as HTMLTextAreaElement).value).toBe("Retain this private draft");
  fireEvent.click(screen.getByRole("button", { name: "Save & Finalize Review" }));
  await waitFor(() => expect(notice.success).toHaveBeenCalledWith("Review submitted successfully!"));
  expect(posts).toHaveLength(2);
  expect(posts[1].headers).toEqual(posts[0].headers);
  expect(posts[1].body).toEqual(posts[0].body);
  expect(JSON.parse(String(posts[0].body)).scores).toEqual({ quality: 7 });
});

it("retains conflict input and reuses the loaded version and receipt after throttling", async () => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("TextEncoder", TextEncoder);
  const puts: RequestInit[] = [];
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      puts.push(init);
      return puts.length === 1
        ? new Response(JSON.stringify({ detail: { message: "Please wait." } }), {
            status: 429, headers: { "Retry-After": "2" } })
        : new Response(JSON.stringify({ status: "CONFLICT", conflict_declared: true,
            submission_version: 4 }), { status: 200 });
    }
    return new Response(JSON.stringify([assignment()]), { status: 200 });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<ReviewerWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: "Declare Conflict" }));
  const reason = screen.getByPlaceholderText("State conflict reason (e.g. Same research institution)...");
  fireEvent.change(reason, { target: { value: "Same institution" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm Recusal" }));
  await waitFor(() => expect(notice.error).toHaveBeenCalledWith("Please wait. Retry after 2 seconds."));
  expect((reason as HTMLTextAreaElement).value).toBe("Same institution");
  fireEvent.click(screen.getByRole("button", { name: "Confirm Recusal" }));
  await waitFor(() => expect(notice.success).toHaveBeenCalled());
  expect(puts).toHaveLength(2);
  expect(puts[1].headers).toEqual(puts[0].headers);
  expect(puts[1].body).toEqual(puts[0].body);
  expect(puts[0].headers).toMatchObject({ "If-Match": "3" });
});

it("shows submitted scores without offering an unsupported edit or another submission", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([assignment("COMPLETED")]), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  render(<ReviewerWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: "View submitted review" }));
  expect(screen.getByText("This submitted review is read-only.")).toBeTruthy();
  expect((screen.getByRole("slider", { name: "Quality" }) as HTMLInputElement).disabled).toBe(true);
  expect(screen.queryByRole("button", { name: "Save & Finalize Review" })).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
