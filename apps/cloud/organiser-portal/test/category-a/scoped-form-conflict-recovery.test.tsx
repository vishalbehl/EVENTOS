// Client command contract only; PostgreSQL/service enforcement is tested separately.
import "@testing-library/jest-dom/vitest";
import React, { useState } from "react";
import { randomUUID, webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const fixture = vi.hoisted(() => ({
  put: vi.fn(),
  state: { user: { id: "accepted-owner", organization_id: "tenant" }, activeContext: null,
    isAuthenticated: true, isContextSwitching: false },
}));
vi.mock("@/lib/api-client", () => ({ apiClient: { put: fixture.put } }));
vi.mock("@/store/use-auth-store", () => ({
  useAuthStore: Object.assign(() => fixture.state, { getState: () => fixture.state }),
  accessContextCacheKey: () => "tenant:workspace:direct:1",
}));
import { useScopedCommand } from "@/hooks/useScopedCommand";

function SaveHarness() {
  const command = useScopedCommand("owned-event");
  const [draft, setDraft] = useState("Retained form question");
  const [saved, setSaved] = useState(false);
  return <form onSubmit={async event => {
    event.preventDefault();
    try {
      const result = await command.execute("put", "/events/owned-event/abstracts/form", { title: draft }, 7);
      if (result) setSaved(true);
    } catch { /* The existing editor owns and retains its draft. */ }
  }}>
    <label>Question draft<input value={draft} onChange={event => setDraft(event.target.value)} /></label>
    <button disabled={command.pending}>Save form</button>
    {command.failure ? <p role="alert">{command.failure.code}</p> : null}
    {saved ? <p role="status">Saved</p> : null}
  </form>;
}

beforeEach(() => {
  fixture.put.mockReset();
  vi.stubGlobal("TextEncoder", TextEncoder);
  vi.stubGlobal("crypto", { subtle: webcrypto.subtle, randomUUID });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("scoped form reconciliation conflicts", () => {
  it.each(["FORM_TEMPLATE_RECONCILIATION_REQUIRED", "ABSTRACT_TEMPLATE_RECONCILIATION_REQUIRED"])(
    "retains draft, version and receipt for explicit retry after %s", async code => {
      fixture.put.mockRejectedValueOnce(Object.assign(new Error("The saved reference requires review."), { status: 409, code }))
        .mockResolvedValueOnce({ version: 8 });
      render(<SaveHarness />);
      fireEvent.click(screen.getByRole("button", { name: "Save form" }));
      await screen.findByRole("alert");
      expect(fixture.put).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText("Question draft")).toHaveValue("Retained form question");
      expect(screen.getByRole("button", { name: "Save form" })).toBeEnabled();
      const first = fixture.put.mock.calls[0][2].headers;
      expect(first["If-Match"]).toBe("7");
      expect(first["Idempotency-Key"]).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Save form" }));
      await screen.findByRole("status");
      expect(fixture.put).toHaveBeenCalledTimes(2);
      expect(fixture.put.mock.calls[1][2].headers).toEqual(first);
      expect(screen.getByLabelText("Question draft")).toHaveValue("Retained form question");
    });

  it("uses a new receipt when the operator changes the rejected document", async () => {
    fixture.put.mockRejectedValueOnce(Object.assign(new Error("Review required."), { status: 409 }))
      .mockResolvedValueOnce({ version: 8 });
    render(<SaveHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Save form" }));
    await screen.findByRole("alert");
    const first = fixture.put.mock.calls[0][2].headers["Idempotency-Key"];
    fireEvent.change(screen.getByLabelText("Question draft"), { target: { value: "Reviewed replacement question" } });
    fireEvent.click(screen.getByRole("button", { name: "Save form" }));
    await waitFor(() => expect(fixture.put).toHaveBeenCalledTimes(2));
    expect(fixture.put.mock.calls[1][2].headers["Idempotency-Key"]).not.toBe(first);
  });
});
