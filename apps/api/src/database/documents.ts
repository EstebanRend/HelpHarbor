import type {
  MessageAuthorType,
  ThreadMatch,
  MessageKind,
  Role,
  TicketPriority,
  TicketStatus,
} from "@helpharbor/contracts";
import type { ObjectId } from "mongodb";

/** Collection names in one place so scripts, tests and repositories agree. */
export const Collections = {
  tenants: "tenants",
  users: "users",
  memberships: "memberships",
  sessions: "sessions",
  counters: "counters",
  customers: "customers",
  tickets: "tickets",
  messages: "messages",
  ticketEvents: "ticket_events",
  outboxEvents: "outbox_events",
} as const;

export interface TenantDoc {
  _id: ObjectId;
  slug: string;
  name: string;
  /** IANA time zone used by the business calendar, e.g. `Europe/Madrid`. */
  timezone: string;
  createdAt: Date;
}

export interface UserDoc {
  _id: ObjectId;
  /** Trimmed, lower-cased email; unique across the platform. */
  emailNormalized: string;
  displayName: string;
  /** argon2id PHC string. */
  passwordHash: string;
  disabledAt: Date | null;
  createdAt: Date;
}

/** Links a user to a tenant with one role. Every tenant-owned document carries `tenantId`. */
export interface MembershipDoc {
  _id: ObjectId;
  tenantId: ObjectId;
  userId: ObjectId;
  role: Role;
  createdAt: Date;
}

export interface SessionDoc {
  _id: ObjectId;
  /** SHA-256 of the cookie value; the raw token is never stored. */
  tokenHash: string;
  userId: ObjectId;
  activeTenantId: ObjectId | null;
  csrfToken: string;
  createdAt: Date;
  lastSeenAt: Date;
  /** Hard limit from login time. */
  absoluteExpiresAt: Date;
  /** min(lastSeenAt + idle timeout, absoluteExpiresAt); a TTL index removes the document after it. */
  expiresAt: Date;
}

/** Per-tenant sequences, e.g. `{ tenantId, name: "ticket", seq: 42 }`. Incremented inside transactions, so numbers have no gaps. */
export interface CounterDoc {
  _id: ObjectId;
  tenantId: ObjectId;
  name: "ticket";
  seq: number;
}

export interface CustomerDoc {
  _id: ObjectId;
  tenantId: ObjectId;
  /** Trimmed, lower-cased; unique per tenant. */
  emailNormalized: string;
  displayName: string;
  createdAt: Date;
}

export interface TicketDoc {
  _id: ObjectId;
  tenantId: ObjectId;
  number: number;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  channel: "email";
  customerId: ObjectId;
  assigneeId: ObjectId | null;
  /** Random token in the reply address (`<slug>+<token>@…`); threads replies even without mail headers. */
  replyToken: string;
  followUpOfTicketId: ObjectId | null;
  messageCount: number;
  /** Incremented on every change; the `ETag` and future `If-Match` checks use it. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
  /** Latest `occurredAt` of any message; the queue is sorted by it. */
  lastActivityAt: Date;
}

/** Messages are immutable once stored; the repository has no update path for them. */
export interface MessageDoc {
  _id: ObjectId;
  tenantId: ObjectId;
  ticketId: ObjectId;
  kind: MessageKind;
  direction: "inbound" | "outbound";
  authorType: MessageAuthorType;
  authorCustomerId: ObjectId | null;
  authorUserId: ObjectId | null;
  authorName: string;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  /** RFC 5322 Message-ID of inbound mail; unique per tenant when present. */
  externalMessageId: string | null;
  /** `In-Reply-To` and `References` of inbound mail, used to thread later or earlier messages. */
  threadRefs: string[];
  /** SHA-256 of the normalized inbound payload; tells a redelivery from a reused Message-ID. */
  contentHash: string | null;
  /** How an inbound message found its ticket; null for messages written in HelpHarbor. */
  threadMatch: ThreadMatch | null;
  occurredAt: Date;
  receivedAt: Date;
}

export type TicketEventType = "ticket.created" | "message.received" | "ticket.status_changed";

export type EventActor =
  | { type: "customer"; id: ObjectId }
  | { type: "user"; id: ObjectId }
  | { type: "system" };

/** Append-only history of a ticket; the source for timelines, reports and SLA recomputation. */
export interface TicketEventDoc {
  _id: ObjectId;
  tenantId: ObjectId;
  ticketId: ObjectId;
  type: TicketEventType;
  actor: EventActor;
  at: Date;
  payload: Record<string, unknown>;
}

export type OutboxEventType = "ticket.created" | "ticket.updated" | "message.created";

/** Written in the same transaction as the change; a relay publishes it after commit (realtime, later). */
export interface OutboxEventDoc {
  _id: ObjectId;
  tenantId: ObjectId;
  type: OutboxEventType;
  aggregateId: ObjectId;
  payload: Record<string, unknown>;
  createdAt: Date;
  publishedAt: Date | null;
}
