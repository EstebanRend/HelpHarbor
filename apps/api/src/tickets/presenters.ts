import type { CustomerSummary, TicketDetail, TicketMessage, TicketSummary } from "@helpharbor/contracts";
import type { CustomerDoc, MessageDoc, TicketDoc } from "../database/documents";

export function toCustomerSummary(customer: CustomerDoc): CustomerSummary {
  return { id: customer._id.toHexString(), email: customer.emailNormalized, displayName: customer.displayName };
}

export function toTicketSummary(ticket: TicketDoc, customer: CustomerDoc): TicketSummary {
  return {
    id: ticket._id.toHexString(),
    number: ticket.number,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    channel: ticket.channel,
    customer: toCustomerSummary(customer),
    assigneeId: ticket.assigneeId?.toHexString() ?? null,
    messageCount: ticket.messageCount,
    version: ticket.version,
    createdAt: ticket.createdAt.toISOString(),
    lastActivityAt: ticket.lastActivityAt.toISOString(),
  };
}

export function toTicketDetail(ticket: TicketDoc, customer: CustomerDoc): TicketDetail {
  return {
    ...toTicketSummary(ticket, customer),
    followUpOfTicketId: ticket.followUpOfTicketId?.toHexString() ?? null,
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

/** The reply token and mail headers are internal threading data and are not exposed. */
export function toTicketMessage(message: MessageDoc): TicketMessage {
  return {
    id: message._id.toHexString(),
    ticketId: message.ticketId.toHexString(),
    kind: message.kind,
    direction: message.direction,
    authorType: message.authorType,
    authorName: message.authorName,
    subject: message.subject,
    bodyText: message.bodyText,
    bodyHtml: message.bodyHtml,
    occurredAt: message.occurredAt.toISOString(),
    receivedAt: message.receivedAt.toISOString(),
  };
}

/** Strong validator for one ticket version; any change to the ticket bumps `version`. */
export function ticketEtag(ticket: TicketDoc): string {
  return `"${ticket._id.toHexString()}.${ticket.version}"`;
}

/** RFC 9110 `If-None-Match`: weak comparison, `*` matches any current representation. */
export function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch
    .split(",")
    .map((tag) => tag.trim().replace(/^W\//, ""))
    .some((tag) => tag === "*" || tag === etag);
}
