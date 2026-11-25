import { Injectable } from "@nestjs/common";
import {
  TICKET_VIEW_STATUSES,
  type MessageListQuery,
  type TicketListQuery,
} from "@helpharbor/contracts";
import type { Filter, ObjectId } from "mongodb";
import type { CustomerDoc, MessageDoc, TicketDoc } from "../database/documents";
import { afterPosition, decodeCursor, encodeCursor } from "./cursor";
import { TicketStore } from "./ticket-store";

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Read side of tickets. Every query starts from the tenant of the caller's session. */
@Injectable()
export class TicketsRepository {
  constructor(private readonly store: TicketStore) {}

  /** A queue view, newest activity first; `_id` breaks ties so paging never skips or repeats. */
  async listQueue(tenantId: ObjectId, userId: ObjectId, query: TicketListQuery): Promise<Page<TicketDoc>> {
    const scope = `queue:${query.view}`;
    const filter: Filter<TicketDoc> = { tenantId, status: { $in: [...TICKET_VIEW_STATUSES[query.view]] } };
    if (query.view === "mine") filter.assigneeId = userId;
    if (query.view === "unassigned") filter.assigneeId = null;
    if (query.cursor) Object.assign(filter, afterPosition("lastActivityAt", decodeCursor(scope, query.cursor), -1));

    const rows = await this.store.tickets
      .find(filter, { sort: { lastActivityAt: -1, _id: -1 }, limit: query.limit + 1 })
      .toArray();
    return toPage(rows, query.limit, (last) => encodeCursor(scope, { at: last.lastActivityAt, id: last._id }));
  }

  findTicket(tenantId: ObjectId, ticketId: ObjectId): Promise<TicketDoc | null> {
    return this.store.tickets.findOne({ tenantId, _id: ticketId });
  }

  /** One ticket's conversation in the order it happened (sender time, then arrival). */
  async listMessages(tenantId: ObjectId, ticketId: ObjectId, query: MessageListQuery): Promise<Page<MessageDoc>> {
    const scope = `messages:${ticketId.toHexString()}`;
    const filter: Filter<MessageDoc> = { tenantId, ticketId };
    if (query.cursor) Object.assign(filter, afterPosition("occurredAt", decodeCursor(scope, query.cursor), 1));

    const rows = await this.store.messages
      .find(filter, { sort: { occurredAt: 1, _id: 1 }, limit: query.limit + 1 })
      .toArray();
    return toPage(rows, query.limit, (last) => encodeCursor(scope, { at: last.occurredAt, id: last._id }));
  }

  async customersById(tenantId: ObjectId, ids: ObjectId[]): Promise<Map<string, CustomerDoc>> {
    if (ids.length === 0) return new Map();
    const customers = await this.store.customers.find({ tenantId, _id: { $in: ids } }).toArray();
    return new Map(customers.map((c) => [c._id.toHexString(), c]));
  }
}

function toPage<T>(rows: T[], limit: number, cursorFor: (last: T) => string): Page<T> {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? cursorFor(last) : null };
}
