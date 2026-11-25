import {
  MessageAuthorTypeSchema,
  MessageKindSchema,
  RoleSchema,
  ThreadMatchSchema,
  TicketPrioritySchema,
  TicketStatusSchema,
} from "@helpharbor/contracts";
import type { Db, Document, IndexDescription } from "mongodb";
import { Collections } from "./documents";

interface CollectionSpec {
  validator: Document;
  indexes: IndexDescription[];
}

const objectId = { bsonType: "objectId" };
const date = { bsonType: "date" };
const nullableObjectId = { bsonType: ["objectId", "null"] };
const plainObject = { bsonType: "object" };

/**
 * Collection-level JSON Schema validators and indexes. Validators are a last
 * line of defence under the Zod checks in the API; `tenantId` leads every
 * compound index on tenant-owned data so a future shard key of
 * `{ tenantId: 1, _id: 1 }` stays possible.
 */
export const COLLECTION_SPECS: Readonly<Record<string, CollectionSpec>> = {
  [Collections.tenants]: {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["slug", "name", "timezone", "createdAt"],
        properties: {
          slug: { bsonType: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", minLength: 3, maxLength: 40 },
          name: { bsonType: "string", minLength: 1 },
          timezone: { bsonType: "string", minLength: 1 },
          createdAt: date,
        },
      },
    },
    indexes: [{ key: { slug: 1 }, name: "slug_unique", unique: true }],
  },
  [Collections.users]: {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["emailNormalized", "displayName", "passwordHash", "disabledAt", "createdAt"],
        properties: {
          emailNormalized: { bsonType: "string", minLength: 3 },
          displayName: { bsonType: "string", minLength: 1 },
          passwordHash: { bsonType: "string", pattern: "^\\$argon2id\\$" },
          disabledAt: { bsonType: ["date", "null"] },
          createdAt: date,
        },
      },
    },
    indexes: [{ key: { emailNormalized: 1 }, name: "email_unique", unique: true }],
  },
  [Collections.memberships]: {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["tenantId", "userId", "role", "createdAt"],
        properties: {
          tenantId: objectId,
          userId: objectId,
          role: { enum: [...RoleSchema.options] },
          createdAt: date,
        },
      },
    },
    indexes: [
      { key: { tenantId: 1, userId: 1 }, name: "tenant_user_unique", unique: true },
      { key: { userId: 1 }, name: "user" },
    ],
  },
  [Collections.sessions]: {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["tokenHash", "userId", "activeTenantId", "csrfToken", "createdAt", "lastSeenAt", "expiresAt"],
        properties: {
          tokenHash: { bsonType: "string", pattern: "^[a-f0-9]{64}$" },
          userId: objectId,
          activeTenantId: { bsonType: ["objectId", "null"] },
          csrfToken: { bsonType: "string", minLength: 32 },
          createdAt: date,
          lastSeenAt: date,
          absoluteExpiresAt: date,
          expiresAt: date,
        },
      },
    },
    indexes: [
      { key: { tokenHash: 1 }, name: "token_unique", unique: true },
      { key: { expiresAt: 1 }, name: "expires_ttl", expireAfterSeconds: 0 },
      { key: { userId: 1 }, name: "user" },
    ],
  },
  [Collections.counters]: {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["tenantId", "name", "seq"],
        properties: {
          tenantId: objectId,
          name: { enum: ["ticket"] },
          seq: { bsonType: ["int", "long"], minimum: 1 },
        },
      },
    },
    indexes: [{ key: { tenantId: 1, name: 1 }, name: "tenant_name_unique", unique: true }],
  },
  [Collections.customers]: {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["tenantId", "emailNormalized", "displayName", "createdAt"],
        properties: {
          tenantId: objectId,
          emailNormalized: { bsonType: "string", minLength: 3 },
          displayName: { bsonType: "string", minLength: 1 },
          createdAt: date,
        },
      },
    },
    indexes: [{ key: { tenantId: 1, emailNormalized: 1 }, name: "tenant_email_unique", unique: true }],
  },
  [Collections.tickets]: {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: [
          "tenantId", "number", "subject", "status", "priority", "channel", "customerId", "assigneeId",
          "replyToken", "followUpOfTicketId", "messageCount", "version", "createdAt", "updatedAt", "lastActivityAt",
        ],
        properties: {
          tenantId: objectId,
          number: { bsonType: ["int", "long"], minimum: 1 },
          subject: { bsonType: "string", minLength: 1 },
          status: { enum: [...TicketStatusSchema.options] },
          priority: { enum: [...TicketPrioritySchema.options] },
          channel: { enum: ["email"] },
          customerId: objectId,
          assigneeId: nullableObjectId,
          replyToken: { bsonType: "string", pattern: "^[a-z2-7]{26}$" },
          followUpOfTicketId: nullableObjectId,
          messageCount: { bsonType: ["int", "long"], minimum: 0 },
          version: { bsonType: ["int", "long"], minimum: 1 },
          createdAt: date,
          updatedAt: date,
          lastActivityAt: date,
        },
      },
    },
    indexes: [
      { key: { tenantId: 1, number: 1 }, name: "tenant_number_unique", unique: true },
      { key: { tenantId: 1, replyToken: 1 }, name: "tenant_reply_token_unique", unique: true },
      // Queue views: status filter, then newest activity first with _id as the tie-breaker.
      { key: { tenantId: 1, status: 1, lastActivityAt: -1, _id: -1 }, name: "tenant_status_activity" },
      { key: { tenantId: 1, assigneeId: 1, status: 1, lastActivityAt: -1, _id: -1 }, name: "tenant_assignee_activity" },
    ],
  },
  [Collections.messages]: {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: [
          "tenantId", "ticketId", "kind", "direction", "authorType", "authorName", "subject", "bodyText",
          "bodyHtml", "externalMessageId", "threadRefs", "occurredAt", "receivedAt",
        ],
        properties: {
          tenantId: objectId,
          ticketId: objectId,
          kind: { enum: [...MessageKindSchema.options] },
          direction: { enum: ["inbound", "outbound"] },
          authorType: { enum: [...MessageAuthorTypeSchema.options] },
          authorCustomerId: nullableObjectId,
          authorUserId: nullableObjectId,
          authorName: { bsonType: "string", minLength: 1 },
          subject: { bsonType: "string" },
          bodyText: { bsonType: "string" },
          bodyHtml: { bsonType: ["string", "null"] },
          externalMessageId: { bsonType: ["string", "null"] },
          threadRefs: { bsonType: "array", items: { bsonType: "string" } },
          contentHash: { bsonType: ["string", "null"] },
          threadMatch: { enum: [...ThreadMatchSchema.options, null] },
          occurredAt: date,
          receivedAt: date,
        },
      },
    },
    indexes: [
      {
        key: { tenantId: 1, externalMessageId: 1 },
        name: "tenant_external_id_unique",
        unique: true,
        // Agent replies have no external id; only inbound mail is deduplicated.
        partialFilterExpression: { externalMessageId: { $type: "string" } },
      },
      { key: { tenantId: 1, ticketId: 1, occurredAt: 1, _id: 1 }, name: "tenant_ticket_conversation" },
      { key: { tenantId: 1, threadRefs: 1 }, name: "tenant_thread_refs" },
    ],
  },
  [Collections.ticketEvents]: {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["tenantId", "ticketId", "type", "actor", "at", "payload"],
        properties: {
          tenantId: objectId,
          ticketId: objectId,
          type: { enum: ["ticket.created", "message.received", "ticket.status_changed"] },
          actor: {
            bsonType: "object",
            required: ["type"],
            properties: { type: { enum: ["customer", "user", "system"] }, id: objectId },
          },
          at: date,
          payload: plainObject,
        },
      },
    },
    indexes: [{ key: { tenantId: 1, ticketId: 1, at: 1, _id: 1 }, name: "tenant_ticket_timeline" }],
  },
  [Collections.outboxEvents]: {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["tenantId", "type", "aggregateId", "payload", "createdAt", "publishedAt"],
        properties: {
          tenantId: objectId,
          type: { enum: ["ticket.created", "ticket.updated", "message.created"] },
          aggregateId: objectId,
          payload: plainObject,
          createdAt: date,
          publishedAt: { bsonType: ["date", "null"] },
        },
      },
    },
    indexes: [
      // Read by the relay across tenants: oldest unpublished events first.
      { key: { publishedAt: 1, createdAt: 1, _id: 1 }, name: "publish_queue" },
    ],
  },
};

/** Creates missing collections, (re)applies validators and builds indexes. Safe to run repeatedly. */
export async function ensureCollections(db: Db): Promise<void> {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const [name, spec] of Object.entries(COLLECTION_SPECS)) {
    if (existing.has(name)) {
      await db.command({ collMod: name, validator: spec.validator, validationLevel: "strict" });
    } else {
      await db.createCollection(name, { validator: spec.validator, validationLevel: "strict" });
    }
    await db.collection(name).createIndexes(spec.indexes);
  }
}
