import { describe, expect, it, vi } from "vitest";
import { fetchApiStatus, readHealth } from "./api-status";

const health = {
  status: "ok",
  service: "helpharbor-api",
  version: "0.0.0",
  environment: "development",
  uptimeSeconds: 3,
  time: "2026-11-20T09:30:00.000Z",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("readHealth", () => {
  it("accepts a payload that matches the shared contract", () => {
    expect(readHealth(health)).toEqual({ state: "up", health });
  });

  it("reports drift from the contract as down", () => {
    expect(readHealth({ status: "ok" }).state).toBe("down");
  });
});

describe("fetchApiStatus", () => {
  it("calls the versioned health route", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(health));
    const status = await fetchApiStatus("http://api.test:4000", fetchImpl);
    expect(status.state).toBe("up");
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe("http://api.test:4000/api/v1/health");
  });

  it("reports HTTP errors", async () => {
    const status = await fetchApiStatus("http://api.test", async () => jsonResponse({}, 503));
    expect(status).toEqual({ state: "down", reason: "API responded with HTTP 503" });
  });

  it("reports network failures without throwing", async () => {
    const status = await fetchApiStatus("http://api.test", async () => {
      throw new TypeError("fetch failed");
    });
    expect(status).toEqual({ state: "down", reason: "API is unreachable" });
  });
});
