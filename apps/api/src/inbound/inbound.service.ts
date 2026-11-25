import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { maskEmail, type InboundEmail, type InboundEmailResult, type ThreadMatch } from "@helpharbor/contracts";
import { type ClientSession, MongoClient, MongoServerError, ObjectId } from "mongodb";
import { APP_CONFIG, type AppConfig } from "../config/env";
import { MONGO_CLIENT } from "../database/database.module";
import type { CustomerDoc, MessageDoc, TicketDoc } from "../database/documents";
import { ApiError } from "../http/api-error";
import { TenancyRepository } from "../tenants/tenancy.repository";
import { newReplyToken } from "../tickets/reply-token";
import { TicketStore } from "../tickets/ticket-store";
import { toStoredBody } from "./email-body";
import { inboundContentHash } from "./inbound-hash";
import { parseRecipient, type InboundRecipient } from "./recipient";

export type IngestResult = InboundEmailResult;

const DUPLICATE_KEY = 11000;
const MAX_ATTEMPTS = 3;
const SUBJECT_MAX = 300;

const unknownRecipient = () =>
  new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, "unknown_recipient", "The recipient is not a HelpHarbor inbound address");

function ticketSubject(subject: string): string {
  const trimmed = subject.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, SUBJECT_MAX) : "(no subject)";
}

function uniqueRefs(email: InboundEmail): string[] {
  const refs = [email.inReplyTo, ...email.references].filter((r): r is string => !!r && r !== email.messageId);
  return [...new Set(refs)].slice(0, 100);
}

/**
 * Turns one inbound email into ticket data:
 * verify (done by the guard) → dedupe → thread → upsert customer and ticket →
 * message → ticket events → outbox, all in one multi-document transaction.
 */
@Injectable()
export class InboundService {
  private readonly logger = new Logger("Inbound");

  constructor(
    @Inject(MONGO_CLIENT) private readonly client: MongoClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly tenancy: TenancyRepository,
    private readonly store: TicketStore,
  ) {}

  async ingest(email: InboundEmail, now = new Date()): Promise<IngestResult> {
    const recipient = parseRecipient(email.to, this.config.INBOUND_EMAIL_DOMAIN);
    const tenant = recipient ? await this.tenancy.findTenantBySlug(recipient.tenantSlug) : null;
    if (!recipient || !tenant) throw unknownRecipient();

    const prepared = { email, recipient, contentHash: inboundContentHash(email), body: toStoredBody(email) };
    for (let attempt = 1; ; attempt++) {
      const session = this.client.startSession();
      try {
        const result = await session.withTransaction(
          (s) => this.ingestInTransaction(tenant._id, prepared, now, s),
          { readPreference: "primary", readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
        );
        if (result.status === "created") {
          this.logger.log(
            `ticket #${result.ticketNumber} ${result.thread} message from ${maskEmail(email.from.email)} [${tenant.slug}]`,
          );
        }
        return result;
      } catch (error) {
        // A concurrent delivery of the same message (or a first mail from the same new
        // customer) committed first: run again and take the duplicate path.
        if (error instanceof MongoServerError && error.code === DUPLICATE_KEY && attempt < MAX_ATTEMPTS) continue;
        throw error;
      } finally {
        await session.endSession();
      }
    }
  }

  private async ingestInTransaction(
    tenantId: ObjectId,
    input: {
      email: InboundEmail;
      recipient: InboundRecipient;
      contentHash: string;
      body: { bodyText: string; bodyHtml: string | null };
    },
    now: Date,
    session: ClientSession,
  ): Promise<IngestResult> {
    const { email, recipient, contentHash, body } = input;
    const { messages, customers, events, outbox } = this.store;

    // 1. Dedupe on (tenantId, Message-ID).
    const existing = await messages.findOne({ tenantId, externalMessageId: email.messageId }, { session });
    if (existing) return this.duplicateResult(tenantId, existing, contentHash, session);

    // 2. Customer by normalized email, created on first contact.
    const customer = await customers.findOneAndUpdate(
      { tenantId, emailNormalized: email.from.email },
      { $setOnInsert: { displayName: email.from.name || email.from.email.split("@")[0]!, createdAt: now } },
      { upsert: true, returnDocument: "after", session },
    );
    if (!customer) throw new Error("customer upsert returned no document");

    // 3. Thread: reply token first, then mail headers (in either arrival order).
    const threadRefs = uniqueRefs(email);
    let { ticket, match } = await this.findThread(tenantId, recipient, email.messageId, threadRefs, customer, session);
    let followUpOf: TicketDoc | null = null;
    if (ticket?.status === "closed") {
      // Closed tickets are immutable; the reply starts a follow-up ticket.
      followUpOf = ticket;
      ticket = null;
      match = "follow_up";
    }

    // Sender clocks are not trusted to be in the past; a future date would pin a ticket to the top of the queue.
    const sentAt = new Date(email.sentAt);
    const occurredAt = sentAt.getTime() > now.getTime() ? now : sentAt;
    const actor = { type: "customer" as const, id: customer._id };

    if (ticket) {
      ticket = await this.appendToTicket(tenantId, ticket, occurredAt, now, actor, session);
    } else {
      ticket = await this.createTicket(tenantId, email, customer, followUpOf, occurredAt, now, actor, session);
    }

    // 4. The message itself, immutable from here on.
    const message: MessageDoc = {
      _id: new ObjectId(),
      tenantId,
      ticketId: ticket._id,
      kind: "public",
      direction: "inbound",
      authorType: "customer",
      authorCustomerId: customer._id,
      authorUserId: null,
      authorName: customer.displayName,
      subject: email.subject.slice(0, SUBJECT_MAX),
      bodyText: body.bodyText,
      bodyHtml: body.bodyHtml,
      externalMessageId: email.messageId,
      threadRefs,
      contentHash,
      threadMatch: match,
      occurredAt,
      receivedAt: now,
    };
    await messages.insertOne(message, { session });
    await events.insertOne(
      {
        _id: new ObjectId(),
        tenantId,
        ticketId: ticket._id,
        type: "message.received",
        actor,
        at: now,
        payload: { messageId: message._id, kind: "public", thread: match },
      },
      { session },
    );
    await outbox.insertOne(
      {
        _id: new ObjectId(),
        tenantId,
        type: "message.created",
        aggregateId: ticket._id,
        payload: { messageId: message._id, kind: "public", ticketVersion: ticket.version },
        createdAt: now,
        publishedAt: null,
      },
      { session },
    );

    return {
      status: "created",
      ticketId: ticket._id.toHexString(),
      ticketNumber: ticket.number,
      messageId: message._id.toHexString(),
      thread: match,
    };
  }

  private async duplicateResult(
    tenantId: ObjectId,
    existing: MessageDoc,
    contentHash: string,
    session: ClientSession,
  ): Promise<IngestResult> {
    if (existing.contentHash !== contentHash) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        "idempotency_key_reused",
        "This Message-ID was already delivered with different content",
      );
    }
    const ticket = await this.store.tickets.findOne({ tenantId, _id: existing.ticketId }, { session });
    if (!ticket) throw new Error(`message ${existing._id.toHexString()} points at a missing ticket`);
    return {
      status: "duplicate",
      ticketId: ticket._id.toHexString(),
      ticketNumber: ticket.number,
      messageId: existing._id.toHexString(),
      thread: existing.threadMatch ?? "new_ticket",
    };
  }

  /**
   * 1. A well-formed reply token that belongs to a ticket of this tenant.
   * 2. Mail headers, in both directions: a stored message this one refers to
   *    (`In-Reply-To`/`References`), or a stored message that refers to this
   *    one (the reply arrived before the message it answers). Header matches
   *    only count for tickets of the same customer, so a guessed Message-ID
   *    cannot drop a message into someone else's conversation.
   */
  private async findThread(
    tenantId: ObjectId,
    recipient: InboundRecipient,
    messageId: string,
    threadRefs: string[],
    customer: CustomerDoc,
    session: ClientSession,
  ): Promise<{ ticket: TicketDoc | null; match: ThreadMatch }> {
    if (recipient.replyToken) {
      const ticket = await this.store.tickets.findOne({ tenantId, replyToken: recipient.replyToken }, { session });
      if (ticket) return { ticket, match: "reply_token" };
    }

    const related = await this.store.messages
      .find(
        {
          tenantId,
          $or: [
            ...(threadRefs.length > 0 ? [{ externalMessageId: { $in: threadRefs } }] : []),
            { threadRefs: messageId },
          ],
        },
        { session, projection: { ticketId: 1 }, limit: 50 },
      )
      .toArray();
    if (related.length > 0) {
      const ticket = await this.store.tickets.findOne(
        { tenantId, _id: { $in: related.map((m) => m.ticketId) }, customerId: customer._id },
        { session, sort: { lastActivityAt: -1, _id: -1 } },
      );
      if (ticket) return { ticket, match: "headers" };
    }
    return { ticket: null, match: "new_ticket" };
  }

  private async createTicket(
    tenantId: ObjectId,
    email: InboundEmail,
    customer: CustomerDoc,
    followUpOf: TicketDoc | null,
    occurredAt: Date,
    now: Date,
    actor: { type: "customer"; id: ObjectId },
    session: ClientSession,
  ): Promise<TicketDoc> {
    // Inside the transaction, so an aborted ingestion does not burn a number.
    const counter = await this.store.counters.findOneAndUpdate(
      { tenantId, name: "ticket" },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after", session },
    );
    if (!counter) throw new Error("ticket counter upsert returned no document");

    const ticket: TicketDoc = {
      _id: new ObjectId(),
      tenantId,
      number: counter.seq,
      subject: ticketSubject(email.subject),
      status: "new",
      priority: "normal",
      channel: "email",
      customerId: customer._id,
      assigneeId: null,
      replyToken: newReplyToken(),
      followUpOfTicketId: followUpOf?._id ?? null,
      messageCount: 1,
      version: 1,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: occurredAt,
    };
    await this.store.tickets.insertOne(ticket, { session });
    await this.store.events.insertOne(
      {
        _id: new ObjectId(),
        tenantId,
        ticketId: ticket._id,
        type: "ticket.created",
        actor,
        at: now,
        payload: { number: ticket.number, channel: "email", status: "new", followUpOfTicketId: ticket.followUpOfTicketId },
      },
      { session },
    );
    await this.store.outbox.insertOne(
      {
        _id: new ObjectId(),
        tenantId,
        type: "ticket.created",
        aggregateId: ticket._id,
        payload: { number: ticket.number, version: 1 },
        createdAt: now,
        publishedAt: null,
      },
      { session },
    );
    return ticket;
  }

  /**
   * A customer reply bumps the version and activity time. Waiting on the
   * customer or solved → open (a solved ticket is reopened); `on_hold` stays,
   * because an agent chose it; `new` and `open` stay as they are.
   */
  private async appendToTicket(
    tenantId: ObjectId,
    ticket: TicketDoc,
    occurredAt: Date,
    now: Date,
    actor: { type: "customer"; id: ObjectId },
    session: ClientSession,
  ): Promise<TicketDoc> {
    const nextStatus = ticket.status === "pending_customer" || ticket.status === "solved" ? "open" : ticket.status;
    const updated = await this.store.tickets.findOneAndUpdate(
      { tenantId, _id: ticket._id },
      {
        $inc: { version: 1, messageCount: 1 },
        $max: { lastActivityAt: occurredAt },
        $set: { status: nextStatus, updatedAt: now },
      },
      { returnDocument: "after", session },
    );
    if (!updated) throw new Error(`ticket ${ticket._id.toHexString()} disappeared during ingestion`);

    if (nextStatus !== ticket.status) {
      await this.store.events.insertOne(
        {
          _id: new ObjectId(),
          tenantId,
          ticketId: ticket._id,
          type: "ticket.status_changed",
          actor,
          at: now,
          payload: { from: ticket.status, to: nextStatus, reason: ticket.status === "solved" ? "reopened_by_customer" : "customer_replied" },
        },
        { session },
      );
    }
    await this.store.outbox.insertOne(
      {
        _id: new ObjectId(),
        tenantId,
        type: "ticket.updated",
        aggregateId: ticket._id,
        payload: { version: updated.version, status: updated.status },
        createdAt: now,
        publishedAt: null,
      },
      { session },
    );
    return updated;
  }
}
