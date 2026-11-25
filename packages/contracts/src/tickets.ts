import { z } from "zod";
import { ObjectIdSchema } from "./common";

/**
 * Ticket lifecycle: new → open → pending_customer → open → solved → closed,
 * with on_hold as a side state. The SLA clock pauses in pending_customer and on_hold.
 */
export const TicketStatusSchema = z.enum([
  "new",
  "open",
  "pending_customer",
  "on_hold",
  "solved",
  "closed",
]);
export type TicketStatus = z.infer<typeof TicketStatusSchema>;

export const TicketPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export type TicketPriority = z.infer<typeof TicketPrioritySchema>;

/** Statuses in which business minutes do not count towards the SLA. */
export const SLA_PAUSED_STATUSES: readonly TicketStatus[] = ["pending_customer", "on_hold"];

export function isSlaPaused(status: TicketStatus): boolean {
  return SLA_PAUSED_STATUSES.includes(status);
}

/** Ticket views offered by the agent queue (`GET /api/v1/tickets?view=`). */
export const TicketViewSchema = z.enum(["all", "active", "mine", "unassigned", "waiting", "done"]);
export type TicketView = z.infer<typeof TicketViewSchema>;

/** Statuses each view lists; `mine` and `unassigned` also exclude solved and closed tickets. */
export const TICKET_VIEW_STATUSES: Readonly<Record<TicketView, readonly TicketStatus[]>> = Object.freeze({
  all: TicketStatusSchema.options,
  active: ["new", "open"],
  mine: ["new", "open", "pending_customer", "on_hold"],
  unassigned: ["new", "open", "pending_customer", "on_hold"],
  waiting: ["pending_customer", "on_hold"],
  done: ["solved", "closed"],
});

export const TICKET_PAGE_DEFAULT_LIMIT = 25;
export const TICKET_PAGE_MAX_LIMIT = 100;
export const MESSAGE_PAGE_DEFAULT_LIMIT = 50;
export const MESSAGE_PAGE_MAX_LIMIT = 200;

const pageLimit = (fallback: number, max: number) => z.coerce.number().int().min(1).max(max).default(fallback);
/** Opaque cursor returned as `nextCursor`; clients send it back unchanged. */
const CursorSchema = z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/, "malformed cursor");

/** Query of `GET /api/v1/tickets`. */
export const TicketListQuerySchema = z.strictObject({
  view: TicketViewSchema.default("active"),
  cursor: CursorSchema.optional(),
  limit: pageLimit(TICKET_PAGE_DEFAULT_LIMIT, TICKET_PAGE_MAX_LIMIT),
});
export type TicketListQuery = z.infer<typeof TicketListQuerySchema>;

/** Query of `GET /api/v1/tickets/{id}/messages`. */
export const MessageListQuerySchema = z.strictObject({
  cursor: CursorSchema.optional(),
  limit: pageLimit(MESSAGE_PAGE_DEFAULT_LIMIT, MESSAGE_PAGE_MAX_LIMIT),
});
export type MessageListQuery = z.infer<typeof MessageListQuerySchema>;

export const CustomerSummarySchema = z.object({
  id: ObjectIdSchema,
  email: z.email(),
  displayName: z.string().min(1),
});
export type CustomerSummary = z.infer<typeof CustomerSummarySchema>;

export const TicketSummarySchema = z.object({
  id: ObjectIdSchema,
  /** Sequential per workspace, starting at 1. */
  number: z.number().int().positive(),
  subject: z.string().min(1),
  status: TicketStatusSchema,
  priority: TicketPrioritySchema,
  channel: z.enum(["email"]),
  customer: CustomerSummarySchema,
  assigneeId: ObjectIdSchema.nullable(),
  messageCount: z.number().int().nonnegative(),
  /** Optimistic-concurrency version; also the basis of the detail `ETag`. */
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  lastActivityAt: z.iso.datetime(),
});
export type TicketSummary = z.infer<typeof TicketSummarySchema>;

/** Response of `GET /api/v1/tickets`, newest activity first. */
export const TicketListResponseSchema = z.object({
  view: TicketViewSchema,
  tickets: z.array(TicketSummarySchema),
  nextCursor: z.string().nullable(),
});
export type TicketListResponse = z.infer<typeof TicketListResponseSchema>;

/** Response of `GET /api/v1/tickets/{id}`; served with an `ETag`. */
export const TicketDetailSchema = TicketSummarySchema.extend({
  /** Earlier closed ticket this one continues, when a customer wrote back after it was closed. */
  followUpOfTicketId: ObjectIdSchema.nullable(),
  updatedAt: z.iso.datetime(),
});
export type TicketDetail = z.infer<typeof TicketDetailSchema>;

/** Public messages reach the customer; internal notes are for staff only. */
export const MessageKindSchema = z.enum(["public", "internal"]);
export type MessageKind = z.infer<typeof MessageKindSchema>;

export const MessageAuthorTypeSchema = z.enum(["customer", "agent", "system"]);
export type MessageAuthorType = z.infer<typeof MessageAuthorTypeSchema>;

export const TicketMessageSchema = z.object({
  id: ObjectIdSchema,
  ticketId: ObjectIdSchema,
  kind: MessageKindSchema,
  direction: z.enum(["inbound", "outbound"]),
  authorType: MessageAuthorTypeSchema,
  authorName: z.string().min(1),
  subject: z.string(),
  bodyText: z.string(),
  /** Sanitized HTML (allowlisted tags only), or null for plain-text messages. */
  bodyHtml: z.string().nullable(),
  /** When the message was sent, as reported by the sender; messages are ordered by it. */
  occurredAt: z.iso.datetime(),
  /** When HelpHarbor stored it. */
  receivedAt: z.iso.datetime(),
});
export type TicketMessage = z.infer<typeof TicketMessageSchema>;

/** Response of `GET /api/v1/tickets/{id}/messages`, oldest first. */
export const MessageListResponseSchema = z.object({
  messages: z.array(TicketMessageSchema),
  nextCursor: z.string().nullable(),
});
export type MessageListResponse = z.infer<typeof MessageListResponseSchema>;

/** Header carrying the inbound webhook signature: `t=<unix seconds>,v1=<hex HMAC-SHA256>`. */
export const INBOUND_SIGNATURE_HEADER = "x-helpharbor-signature";

/** RFC 5322 Message-ID as sent by mail providers, angle brackets included, e.g. `<abc.123@mail.example>`. */
export const EmailMessageIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(998)
  .regex(/^<[^<>\s]+>$/, "must look like <local@domain>");

export const INBOUND_TEXT_MAX = 64_000;
export const INBOUND_HTML_MAX = 96_000;

/**
 * Body of `POST /api/v1/inbound/email`, the simulated mail provider's webhook.
 * The workspace comes from the recipient address, never from a separate field.
 */
export const InboundEmailSchema = z
  .strictObject({
    messageId: EmailMessageIdSchema,
    inReplyTo: EmailMessageIdSchema.optional(),
    references: z.array(EmailMessageIdSchema).max(100).default([]),
    from: z.strictObject({
      email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
      name: z.string().trim().max(200).optional(),
    }),
    to: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    subject: z.string().max(998).default(""),
    text: z.string().max(INBOUND_TEXT_MAX).optional(),
    html: z.string().max(INBOUND_HTML_MAX).optional(),
    sentAt: z.iso.datetime({ offset: true }),
  })
  .refine((email) => email.text !== undefined || email.html !== undefined, {
    message: "text or html is required",
    path: ["text"],
  });
export type InboundEmail = z.infer<typeof InboundEmailSchema>;
export type InboundEmailInput = z.input<typeof InboundEmailSchema>;

/** How an inbound message found its ticket. */
export const ThreadMatchSchema = z.enum(["new_ticket", "reply_token", "headers", "follow_up"]);
export type ThreadMatch = z.infer<typeof ThreadMatchSchema>;

/** Response of the inbound webhook: 201 `created` the first time, 200 `duplicate` on redelivery. */
export const InboundEmailResultSchema = z.object({
  status: z.enum(["created", "duplicate"]),
  ticketId: ObjectIdSchema,
  ticketNumber: z.number().int().positive(),
  messageId: ObjectIdSchema,
  thread: ThreadMatchSchema,
});
export type InboundEmailResult = z.infer<typeof InboundEmailResultSchema>;
