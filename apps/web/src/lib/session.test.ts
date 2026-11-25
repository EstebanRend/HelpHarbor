import { describe, expect, it, vi } from "vitest";
import { fetchSession } from "./session";

const tenant = { id: "6741a0000000000000000001", slug: "acme-cloud", name: "Acme Cloud", timezone: "Europe/Madrid" };
const session = {
  user: { id: "6741a0000000000000000103", email: "ana.agent@acme-cloud.example", displayName: "Ana Gómez" },
  memberships: [{ tenant, role: "agent" }],
  activeTenant: { tenant, role: "agent" },
  csrfToken: "c".repeat(43),
  expiresAt: "2026-11-25T18:00:00.000Z",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const envelope = (code: string) => ({ error: { code, message: "x" } });

describe("fetchSession", () => {
  it("does not call the API without cookies", async () => {
    const fetchImpl = vi.fn();
    expect(await fetchSession("http://api.test", undefined, fetchImpl)).toEqual({ state: "anonymous" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("forwards the browser cookies to the session route", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json(session));
    const state = await fetchSession("http://api.test:4000", "hh_session=abc", fetchImpl);
    expect(state).toEqual({ state: "authenticated", session });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe("http://api.test:4000/api/v1/auth/session");
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({ cookie: "hh_session=abc" });
  });

  it("tells an expired session apart from a missing one", async () => {
    expect(await fetchSession("http://api.test", "hh_session=old", async () => json(envelope("session_expired"), 401))).toEqual({
      state: "expired",
    });
    expect(await fetchSession("http://api.test", "theme=dark", async () => json(envelope("unauthenticated"), 401))).toEqual({
      state: "anonymous",
    });
  });

  it("reports contract drift, server errors and network failures as unavailable", async () => {
    const drift = await fetchSession("http://api.test", "c=1", async () => json({ user: {} }));
    expect(drift.state).toBe("unavailable");
    const down = await fetchSession("http://api.test", "c=1", async () => json(envelope("internal_error"), 500));
    expect(down).toEqual({ state: "unavailable", reason: "API responded with HTTP 500" });
    const offline = await fetchSession("http://api.test", "c=1", async () => {
      throw new TypeError("fetch failed");
    });
    expect(offline).toEqual({ state: "unavailable", reason: "API is unreachable" });
  });
});
