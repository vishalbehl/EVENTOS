import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const globals = readFileSync(resolve(root, "app/globals.css"), "utf8");
const themes = readFileSync(resolve(root, "src/styles/themes.css"), "utf8");

describe("design system token contract", () => {
  it.each([
    "--bg-base", "--bg-surface", "--text-primary", "--border-default",
    "--status-success", "--status-warning", "--status-danger", "--status-info",
    "--chart-1", "--chart-5", "--shadow-overlay", "--motion-standard",
    "--control-height", "--table-row-height",
  ])("defines %s", (token) => expect(globals).toContain(token));

  it("defines explicit light and dark color schemes", () => {
    expect(themes).toMatch(/data-theme="plasma-violet"[\s\S]*color-scheme:\s*dark/);
    expect(themes).toMatch(/data-theme="light"[\s\S]*color-scheme:\s*light/);
  });

  it("supports reduced motion, forced colors, and compact density", () => {
    expect(globals).toContain("prefers-reduced-motion: reduce");
    expect(globals).toContain("forced-colors: active");
    expect(globals).toContain('[data-density="compact"]');
  });
});
