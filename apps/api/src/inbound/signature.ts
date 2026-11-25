import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Inbound webhook signatures, modelled on common mail/payment providers:
 *
 *     x-helpharbor-signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
 *
 * The timestamp is signed too, so an old request cannot be replayed with a new
 * `t`; requests outside the tolerance window are refused. Several `v1=` values
 * are accepted so a provider can sign with an old and a new secret while rotating.
 */
export function computeInboundSignature(secret: string, timestamp: number, rawBody: Buffer | string): string {
  return createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex");
}

/** Builds the header value a sender puts on a request (used by tests and the sample sender). */
export function signInboundRequest(secret: string, rawBody: Buffer | string, now = new Date()): string {
  const timestamp = Math.floor(now.getTime() / 1000);
  return `t=${timestamp},v1=${computeInboundSignature(secret, timestamp, rawBody)}`;
}

export type SignatureCheck =
  | { ok: true; timestamp: number }
  | { ok: false; reason: "missing" | "malformed" | "expired" | "mismatch" };

const HEX_SHA256 = /^[a-f0-9]{64}$/;

function parseHeader(header: string): { timestamp: number; signatures: string[] } | null {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) return null;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") {
      if (!/^\d{1,12}$/.test(value) || timestamp !== null) return null;
      timestamp = Number(value);
    } else if (key === "v1") {
      if (!HEX_SHA256.test(value)) return null;
      signatures.push(value);
    }
    // Unknown schemes (v0, v2…) are ignored so senders can add newer ones.
  }
  return timestamp === null || signatures.length === 0 ? null : { timestamp, signatures };
}

export function verifyInboundSignature(
  secret: string,
  header: string | undefined,
  rawBody: Buffer,
  toleranceSeconds: number,
  now = new Date(),
): SignatureCheck {
  if (!header) return { ok: false, reason: "missing" };
  const parsed = parseHeader(header);
  if (!parsed) return { ok: false, reason: "malformed" };
  if (Math.abs(Math.floor(now.getTime() / 1000) - parsed.timestamp) > toleranceSeconds) {
    return { ok: false, reason: "expired" };
  }
  const expected = Buffer.from(computeInboundSignature(secret, parsed.timestamp, rawBody), "hex");
  const matches = parsed.signatures.some((candidate) => timingSafeEqual(expected, Buffer.from(candidate, "hex")));
  return matches ? { ok: true, timestamp: parsed.timestamp } : { ok: false, reason: "mismatch" };
}
