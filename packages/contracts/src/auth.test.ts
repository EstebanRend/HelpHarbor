import { describe, expect, it } from "vitest";
import {
  LoginRequestSchema,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  SessionResponseSchema,
  SwitchTenantRequestSchema,
  hasPermission,
} from "./index";

const tenant = {
  id: "65f1c2a9b8e4d3c2b1a09f8e",
  slug: "acme-cloud",
  name: "Acme Cloud",
  timezone: "Europe/Madrid",
};

describe("LoginRequestSchema", () => {
  it("accepts email and password with an optional workspace", () => {
    const body = { email: "ana@acme-cloud.example", password: "correct horse", tenantSlug: "acme-cloud" };
    expect(LoginRequestSchema.parse(body)).toEqual(body);
  });

  it("rejects unknown keys and operator objects", () => {
    expect(LoginRequestSchema.safeParse({ email: "a@b.example", password: "x", role: "admin" }).success).toBe(
      false,
    );
    expect(LoginRequestSchema.safeParse({ email: { $ne: null }, password: "x" }).success).toBe(false);
    expect(LoginRequestSchema.safeParse({ email: "a@b.example", password: { $gt: "" } }).success).toBe(false);
  });

  it("normalizes the email", () => {
    const parsed = LoginRequestSchema.parse({ email: "  Ana.Agent@Acme-Cloud.EXAMPLE ", password: "x" });
    expect(parsed.email).toBe("ana.agent@acme-cloud.example");
  });

  it("rejects an empty password", () => {
    expect(LoginRequestSchema.safeParse({ email: "a@b.example", password: "" }).success).toBe(false);
  });
});

describe("SwitchTenantRequestSchema", () => {
  it("requires a valid slug", () => {
    expect(SwitchTenantRequestSchema.safeParse({ tenantSlug: "globex" }).success).toBe(true);
    expect(SwitchTenantRequestSchema.safeParse({ tenantSlug: "Globex Hosting" }).success).toBe(false);
  });
});

describe("SessionResponseSchema", () => {
  const session = {
    user: { id: "65f1c2a9b8e4d3c2b1a09f8f", email: "ana@acme-cloud.example", displayName: "Ana" },
    memberships: [{ tenant, role: "agent" }],
    activeTenant: { tenant, role: "agent" },
    csrfToken: "x".repeat(43),
    expiresAt: "2026-11-25T18:00:00.000Z",
  };

  it("accepts a session with an active workspace", () => {
    expect(SessionResponseSchema.parse(session)).toEqual(session);
  });

  it("allows a user without memberships", () => {
    const parsed = SessionResponseSchema.parse({ ...session, memberships: [], activeTenant: null });
    expect(parsed.activeTenant).toBeNull();
  });

  it("rejects an unknown role", () => {
    const bad = { ...session, activeTenant: { tenant, role: "owner" } };
    expect(SessionResponseSchema.safeParse(bad).success).toBe(false);
  });
});

describe("role permissions", () => {
  it("gives admins every permission", () => {
    expect([...ROLE_PERMISSIONS.admin]).toEqual([...PERMISSIONS]);
  });

  it("matches the persona role matrix", () => {
    expect(hasPermission("lead", "tickets:assign_others")).toBe(true);
    expect(hasPermission("lead", "reports:read")).toBe(true);
    expect(hasPermission("lead", "sla:manage")).toBe(false);
    expect(hasPermission("lead", "members:manage")).toBe(false);
    expect(hasPermission("agent", "tickets:reply")).toBe(true);
    expect(hasPermission("agent", "tickets:assign_others")).toBe(false);
    expect(hasPermission("agent", "kb:draft")).toBe(false);
    expect(hasPermission("agent", "reports:read")).toBe(false);
  });

  it("only uses known permissions", () => {
    for (const granted of Object.values(ROLE_PERMISSIONS)) {
      for (const permission of granted) expect(PERMISSIONS).toContain(permission);
    }
  });
});
