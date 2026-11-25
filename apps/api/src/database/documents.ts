import type { Role } from "@helpharbor/contracts";
import type { ObjectId } from "mongodb";

/** Collection names in one place so scripts, tests and repositories agree. */
export const Collections = {
  tenants: "tenants",
  users: "users",
  memberships: "memberships",
  sessions: "sessions",
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
