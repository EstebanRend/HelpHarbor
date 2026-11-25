import { TenantSlugSchema } from "@helpharbor/contracts";

export interface InboundRecipient {
  tenantSlug: string;
  /** Present when the customer replied to an address that carries a ticket's reply token. */
  replyToken: string | null;
}

const REPLY_TOKEN = /^[a-z2-7]{26}$/;

/**
 * Inbound addresses are `<workspace slug>@<inbound domain>`, and replies to a
 * ticket go to `<slug>+<reply token>@<inbound domain>`. Anything else
 * (another domain, a bad slug, a malformed token) is not ours: null.
 */
export function parseRecipient(address: string, inboundDomain: string): InboundRecipient | null {
  const at = address.lastIndexOf("@");
  if (at <= 0 || address.slice(at + 1).toLowerCase() !== inboundDomain) return null;
  const local = address.slice(0, at).toLowerCase();
  const plus = local.indexOf("+");
  const slug = plus === -1 ? local : local.slice(0, plus);
  const token = plus === -1 ? null : local.slice(plus + 1);
  if (!TenantSlugSchema.safeParse(slug).success) return null;
  if (token !== null && !REPLY_TOKEN.test(token)) return null;
  return { tenantSlug: slug, replyToken: token };
}

export function replyAddress(tenantSlug: string, replyToken: string, inboundDomain: string): string {
  return `${tenantSlug}+${replyToken}@${inboundDomain}`;
}
