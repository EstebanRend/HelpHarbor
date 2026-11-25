import { describe, expect, it, vi } from "vitest";
import { isSessionLost, loginErrorMessage, postJson } from "./auth-client";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("postJson", () => {
  it("sends JSON with the CSRF header when given a token", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json({ ok: 1 }));
    const result = await postJson("/api/v1/auth/switch-tenant", { tenantSlug: "globex-hosting" }, "tok", fetchImpl);
    expect(result).toEqual({ ok: true, body: { ok: 1 } });
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("same-origin");
    expect(init?.headers).toMatchObject({ "x-csrf-token": "tok", "content-type": "application/json" });
    expect(init?.body).toBe('{"tenantSlug":"globex-hosting"}');
  });

  it("handles 204 responses without a body", async () => {
    const result = await postJson("/api/v1/auth/logout", undefined, "tok", async () => new Response(null, { status: 204 }));
    expect(result).toEqual({ ok: true, body: null });
  });

  it("returns the error code from the envelope", async () => {
    const result = await postJson("/x", {}, undefined, async () =>
      json({ error: { code: "invalid_credentials", message: "no" } }, 401),
    );
    expect(result).toEqual({ ok: false, status: 401, code: "invalid_credentials" });
    expect(isSessionLost(result)).toBe(true);
  });

  it("reports network failures and non-envelope errors", async () => {
    expect(
      await postJson("/x", {}, undefined, async () => {
        throw new TypeError("offline");
      }),
    ).toEqual({ ok: false, status: 0, code: "network_error" });
    expect(await postJson("/x", {}, undefined, async () => new Response("<html>", { status: 502 }))).toEqual({
      ok: false,
      status: 502,
      code: "request_failed",
    });
  });
});

describe("loginErrorMessage", () => {
  it("does not reveal whether the email exists", () => {
    expect(loginErrorMessage("invalid_credentials")).toBe("Email or password is incorrect.");
  });

  it("has a fallback for unexpected codes", () => {
    expect(loginErrorMessage("origin_not_allowed")).toMatch(/Sign-in failed/);
  });
});
