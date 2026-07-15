import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "../app");

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("app-wide design system adoption", () => {
  it("routes dashboard pages through approved composition primitives", () => {
    const pages = filesUnder(appRoot).filter((path) => path.endsWith("page.tsx"));
    const standaloneExceptions = [resolve(appRoot, "(auth)/page.tsx"), resolve(appRoot, "proposal-share/page.tsx")];
    const failures = pages.filter((path) => {
      if (standaloneExceptions.includes(path)) return false;
      const source = readFileSync(path, "utf8");
      return !/PageWrapper|PageContainer|UnavailableRouteState|ProposalForm|QuoteForm|export\s*\{\s*default\s*\}/.test(source);
    });
    expect(failures).toEqual([]);
  });

  it("does not link the shell to missing legacy documentation routes", () => {
    const layoutSources = filesUnder(resolve(__dirname, "../components/layout")).filter((path) => path.endsWith(".tsx")).map((path) => readFileSync(path, "utf8")).join("\n");
    expect(layoutSources).not.toContain('href="/docs"');
    expect(layoutSources).not.toContain('href: "/docs"');
  });
});
