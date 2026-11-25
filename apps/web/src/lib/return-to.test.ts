import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_LOGIN, loginUrl, safeReturnTo } from "./return-to";

describe("safeReturnTo", () => {
  it("keeps same-site paths with their query", () => {
    expect(safeReturnTo("/settings/members")).toBe("/settings/members");
    expect(safeReturnTo("/console?view=mine")).toBe("/console?view=mine");
  });

  it.each([
    undefined,
    "",
    "https://evil.example/console",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "console",
    "/login?returnTo=/console",
  ])("falls back for %s", (value) => {
    expect(safeReturnTo(value)).toBe(DEFAULT_AFTER_LOGIN);
  });

  it("uses the first value of a repeated parameter", () => {
    expect(safeReturnTo(["/settings/members", "https://evil.example"])).toBe("/settings/members");
  });
});

describe("loginUrl", () => {
  it("marks expired sessions and keeps the page to return to", () => {
    expect(loginUrl("/settings/members", true)).toBe("/login?expired=1&returnTo=%2Fsettings%2Fmembers");
    expect(loginUrl("https://evil.example")).toBe("/login?returnTo=%2Fconsole");
  });
});
