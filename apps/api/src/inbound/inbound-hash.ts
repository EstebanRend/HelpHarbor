import { createHash } from "node:crypto";
import type { InboundEmail } from "@helpharbor/contracts";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
}

/**
 * Fingerprint of a validated inbound email, independent of key order and
 * whitespace in the JSON. A redelivery has the same fingerprint; a different
 * email reusing a Message-ID does not.
 */
export function inboundContentHash(email: InboundEmail): string {
  return createHash("sha256").update(JSON.stringify(canonical(email))).digest("hex");
}
