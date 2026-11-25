import { RoleSchema } from "@helpharbor/contracts";
import type { Db, Document, IndexDescription } from "mongodb";
import { Collections } from "./documents";

interface CollectionSpec {
  validator: Document;
  indexes: IndexDescription[];
}

const objectId = { bsonType: "objectId" };
const date = { bsonType: "date" };

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
