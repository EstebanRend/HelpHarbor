import { Inject, Injectable } from "@nestjs/common";
import type { Db } from "mongodb";
import { MONGO_DB } from "../database/database.module";
import {
  Collections,
  type CounterDoc,
  type CustomerDoc,
  type MessageDoc,
  type OutboxEventDoc,
  type TicketDoc,
  type TicketEventDoc,
} from "../database/documents";
import { TenantScopedCollection } from "../database/tenant-scoped-collection";

/** The tenant-scoped collections of the ticket domain, shared by the read and ingestion paths. */
@Injectable()
export class TicketStore {
  readonly counters: TenantScopedCollection<CounterDoc>;
  readonly customers: TenantScopedCollection<CustomerDoc>;
  readonly tickets: TenantScopedCollection<TicketDoc>;
  readonly messages: TenantScopedCollection<MessageDoc>;
  readonly events: TenantScopedCollection<TicketEventDoc>;
  readonly outbox: TenantScopedCollection<OutboxEventDoc>;

  constructor(@Inject(MONGO_DB) db: Db) {
    this.counters = new TenantScopedCollection(db.collection<CounterDoc>(Collections.counters));
    this.customers = new TenantScopedCollection(db.collection<CustomerDoc>(Collections.customers));
    this.tickets = new TenantScopedCollection(db.collection<TicketDoc>(Collections.tickets));
    this.messages = new TenantScopedCollection(db.collection<MessageDoc>(Collections.messages));
    this.events = new TenantScopedCollection(db.collection<TicketEventDoc>(Collections.ticketEvents));
    this.outbox = new TenantScopedCollection(db.collection<OutboxEventDoc>(Collections.outboxEvents));
  }
}
