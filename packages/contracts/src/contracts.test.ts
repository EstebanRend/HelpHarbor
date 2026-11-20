import { describe, expect, it } from "vitest";
import {
  ErrorEnvelopeSchema,
  HealthResponseSchema,
  ObjectIdSchema,
  RoleSchema,
  TenantSlugSchema,
  TicketStatusSchema,
  isSlaPaused,
} from "./index";

const health = {
  status: "ok",
  service: "helpharbor-api",
  version: "0.0.0",
  environment: "test",
  uptimeSeconds: 12,
  time: "2026-11-20T09:30:00.000Z",
};

describe("HealthResponseSchema", () => {
  it("accepts the API health payload", () => {
    expect(HealthResponseSchema.parse(health)).toEqual(health);
  });

  it("rejects a payload from another service", () => {
    expect(HealthResponseSchema.safeParse({ ...health, service: "other" }).success).toBe(false);
  });

  it("rejects a non-ISO timestamp and negative uptime", () => {
    expect(HealthResponseSchema.safeParse({ ...health, time: "yesterday" }).success).toBe(false);
    expect(HealthResponseSchema.safeParse({ ...health, uptimeSeconds: -1 }).success).toBe(false);
  });
});

describe("ErrorEnvelopeSchema", () => {
  it("accepts an envelope with validation details", () => {
    const body = {
      error: {
        code: "validation_failed",
        message: "Request body is invalid",
        requestId: "req_1",
        details: [{ path: "priority", message: "Invalid option" }],
      },
    };
    expect(ErrorEnvelopeSchema.parse(body)).toEqual(body);
  });

  it("requires a snake_case code", () => {
    const body = { error: { code: "NotFound", message: "Ticket not found" } };
    expect(ErrorEnvelopeSchema.safeParse(body).success).toBe(false);
  });
});

describe("primitives", () => {
  it("validates ObjectIds", () => {
    expect(ObjectIdSchema.safeParse("65f1c2a9b8e4d3c2b1a09f8e").success).toBe(true);
    expect(ObjectIdSchema.safeParse("65F1C2A9B8E4D3C2B1A09F8E").success).toBe(false);
    expect(ObjectIdSchema.safeParse("123").success).toBe(false);
  });

  it("validates tenant slugs", () => {
    expect(TenantSlugSchema.safeParse("northwind-support").success).toBe(true);
    expect(TenantSlugSchema.safeParse("Northwind").success).toBe(false);
    expect(TenantSlugSchema.safeParse("a--b").success).toBe(false);
  });

  it("knows the three membership roles", () => {
    expect(RoleSchema.options).toEqual(["admin", "lead", "agent"]);
  });
});

describe("ticket status", () => {
  it("pauses the SLA only while waiting on the customer or on hold", () => {
    const paused = TicketStatusSchema.options.filter(isSlaPaused);
    expect(paused).toEqual(["pending_customer", "on_hold"]);
  });
});
