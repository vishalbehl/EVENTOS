import { describe, expect, it } from "vitest";
import { resolveTheme } from "./useTheme";

describe("resolveTheme", () => {
  it("keeps an explicit light or dark preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("resolves system preference without changing the saved preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});
