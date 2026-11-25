import { describe, expect, it } from "vitest";
import { navigationFor } from "./navigation";

const labels = (role: Parameters<typeof navigationFor>[0]) => navigationFor(role).map((item) => item.label);

describe("navigationFor", () => {
  it("shows admins every area", () => {
    expect(labels("admin")).toEqual(["Queue", "Knowledge base", "Reports", "SLA policies", "Members"]);
  });

  it("hides SLA policies and members from leads", () => {
    expect(labels("lead")).toEqual(["Queue", "Knowledge base", "Reports"]);
  });

  it("shows agents only the queue", () => {
    expect(labels("agent")).toEqual(["Queue"]);
  });

  it("links only to pages that exist", () => {
    const linked = navigationFor("admin").filter((item) => item.available).map((item) => item.href);
    expect(linked).toEqual(["/console", "/settings/members"]);
  });
});
