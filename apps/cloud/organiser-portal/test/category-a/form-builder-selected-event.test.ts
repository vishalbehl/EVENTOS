import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { organiserFormService } from "@/services/form-template-service";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiGet: api.get, apiPost: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn() }));

it("retains the selected event for every registration-builder template read", () => {
  const source = readFileSync(resolve("app/(dashboard)/events/[eventId]/registration/form-builder/page.tsx"), "utf8");
  const tree = ts.createSourceFile("builder.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let calls = 0;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === "organiserFormService.getTemplate") {
      calls += 1;
      expect(node.arguments.length).toBe(3);
      expect(node.arguments[1].getText(tree)).toBe("eventId");
      expect(node.arguments[2].getText(tree)).toBe("controller.signal");
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  // The former six branches now share one abortable, event-scoped adapter.
  expect(calls).toBe(1);
  expect(source).toContain("loadRegistrationEditor(eventId, templateId");
});

it("encodes source identity and transmits event scope to the canonical read endpoint", async () => {
  api.get.mockResolvedValue({ id: "source" });
  await organiserFormService.getTemplate("source/with reserved?characters", "event/with scope");
  expect(api.get).toHaveBeenCalledWith("/forms/templates/source%2Fwith%20reserved%3Fcharacters?event_id=event%2Fwith%20scope", { signal: undefined });
});
