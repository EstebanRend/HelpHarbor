import { computeInboundSignature, signInboundRequest, verifyInboundSignature } from "./signature";

const SECRET = "s".repeat(40);
const BODY = Buffer.from('{"messageId":"<a@b.example>"}');
const NOW = new Date("2026-11-25T10:00:00Z");
const T = Math.floor(NOW.getTime() / 1000);

describe("inbound signatures", () => {
  it("accepts a header produced by signInboundRequest", () => {
    const header = signInboundRequest(SECRET, BODY, NOW);
    expect(header).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    expect(verifyInboundSignature(SECRET, header, BODY, 300, NOW)).toEqual({ ok: true, timestamp: T });
  });

  it("refuses a missing or malformed header", () => {
    expect(verifyInboundSignature(SECRET, undefined, BODY, 300, NOW)).toEqual({ ok: false, reason: "missing" });
    expect(verifyInboundSignature(SECRET, "", BODY, 300, NOW)).toEqual({ ok: false, reason: "missing" });
    for (const header of ["v1=abc", `t=${T}`, `t=abc,v1=${"a".repeat(64)}`, `t=${T},v1=xyz`, `t=${T},t=${T},v1=${"a".repeat(64)}`]) {
      expect(verifyInboundSignature(SECRET, header, BODY, 300, NOW)).toEqual({ ok: false, reason: "malformed" });
    }
  });

  it("refuses a changed body, another secret or a re-stamped timestamp", () => {
    const header = signInboundRequest(SECRET, BODY, NOW);
    expect(verifyInboundSignature(SECRET, header, Buffer.from(`${BODY} `), 300, NOW).ok).toBe(false);
    expect(verifyInboundSignature("x".repeat(40), header, BODY, 300, NOW).ok).toBe(false);
    const restamped = header.replace(`t=${T}`, `t=${T + 1}`);
    expect(verifyInboundSignature(SECRET, restamped, BODY, 300, NOW)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("refuses requests outside the tolerance window in either direction", () => {
    const old = signInboundRequest(SECRET, BODY, new Date(NOW.getTime() - 301_000));
    const future = signInboundRequest(SECRET, BODY, new Date(NOW.getTime() + 301_000));
    const edge = signInboundRequest(SECRET, BODY, new Date(NOW.getTime() - 300_000));
    expect(verifyInboundSignature(SECRET, old, BODY, 300, NOW)).toEqual({ ok: false, reason: "expired" });
    expect(verifyInboundSignature(SECRET, future, BODY, 300, NOW)).toEqual({ ok: false, reason: "expired" });
    expect(verifyInboundSignature(SECRET, edge, BODY, 300, NOW).ok).toBe(true);
  });

  it("accepts any of several v1 signatures (secret rotation) and ignores unknown schemes", () => {
    const valid = computeInboundSignature(SECRET, T, BODY);
    const header = `t=${T},v0=legacy,v1=${"0".repeat(64)},v1=${valid}`;
    expect(verifyInboundSignature(SECRET, header, BODY, 300, NOW).ok).toBe(true);
  });
});
