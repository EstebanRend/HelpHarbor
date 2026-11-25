import { DEMO_TENANTS, DEMO_USERS, assertUsableDemoPassword } from "./demo-identities";

describe("demo identities", () => {
  it("uses only reserved example domains", () => {
    for (const user of DEMO_USERS) expect(user.email).toMatch(/@[a-z-]+\.example$/);
  });

  it("gives each tenant an admin, a lead and two agents", () => {
    for (const tenant of DEMO_TENANTS) {
      const roles = DEMO_USERS.flatMap((u) => u.memberships.filter((m) => m.tenant === tenant.slug).map((m) => m.role));
      expect(roles.sort()).toEqual(["admin", "agent", "agent", "lead"]);
    }
  });

  it("has unique ids and emails", () => {
    expect(new Set(DEMO_USERS.map((u) => u._id)).size).toBe(DEMO_USERS.length);
    expect(new Set(DEMO_USERS.map((u) => u.email)).size).toBe(DEMO_USERS.length);
  });

  it("refuses missing, short or placeholder passwords", () => {
    expect(() => assertUsableDemoPassword(undefined)).toThrow(/at least 12/);
    expect(() => assertUsableDemoPassword("short")).toThrow(/at least 12/);
    expect(() => assertUsableDemoPassword("change-me-please-123")).toThrow(/placeholder/);
    expect(() => assertUsableDemoPassword("harbor lights at dusk")).not.toThrow();
  });
});
