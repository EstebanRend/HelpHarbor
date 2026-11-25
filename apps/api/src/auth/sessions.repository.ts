import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { type Collection, type Db, ObjectId } from "mongodb";
import { APP_CONFIG, type AppConfig } from "../config/env";
import { MONGO_DB } from "../database/database.module";
import { Collections, type SessionDoc } from "../database/documents";

/** Only refresh `lastSeenAt` once a minute so reads do not turn into writes. */
const TOUCH_INTERVAL_MS = 60_000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type SessionLookup =
  | { state: "active"; session: SessionDoc }
  | { state: "expired" }
  | { state: "missing" };

@Injectable()
export class SessionsRepository {
  private readonly sessions: Collection<SessionDoc>;

  constructor(
    @Inject(MONGO_DB) db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    this.sessions = db.collection<SessionDoc>(Collections.sessions);
  }

  private get idleMs(): number {
    return this.config.SESSION_IDLE_MINUTES * 60_000;
  }

  /** Creates a session and returns the raw cookie token, which is never stored. */
  async create(userId: ObjectId, activeTenantId: ObjectId | null, now = new Date()): Promise<{ token: string; session: SessionDoc }> {
    const token = randomBytes(32).toString("base64url");
    const absoluteExpiresAt = new Date(now.getTime() + this.config.SESSION_ABSOLUTE_HOURS * 3_600_000);
    const session: SessionDoc = {
      _id: new ObjectId(),
      tokenHash: hashToken(token),
      userId,
      activeTenantId,
      csrfToken: randomBytes(32).toString("base64url"),
      createdAt: now,
      lastSeenAt: now,
      absoluteExpiresAt,
      expiresAt: this.nextExpiry(now, absoluteExpiresAt),
    };
    await this.sessions.insertOne(session);
    return { token, session };
  }

  /**
   * Resolves a cookie token. An expired session is deleted straight away
   * rather than waiting for the TTL monitor, which runs only once a minute.
   */
  async lookup(token: string, now = new Date()): Promise<SessionLookup> {
    const session = await this.sessions.findOne({ tokenHash: hashToken(token) });
    if (!session) return { state: "missing" };
    if (session.expiresAt.getTime() <= now.getTime()) {
      await this.sessions.deleteOne({ _id: session._id });
      return { state: "expired" };
    }
    if (now.getTime() - session.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) {
      const expiresAt = this.nextExpiry(now, session.absoluteExpiresAt);
      await this.sessions.updateOne({ _id: session._id }, { $set: { lastSeenAt: now, expiresAt } });
      return { state: "active", session: { ...session, lastSeenAt: now, expiresAt } };
    }
    return { state: "active", session };
  }

  async setActiveTenant(sessionId: ObjectId, tenantId: ObjectId | null): Promise<void> {
    await this.sessions.updateOne({ _id: sessionId }, { $set: { activeTenantId: tenantId } });
  }

  async delete(sessionId: ObjectId): Promise<void> {
    await this.sessions.deleteOne({ _id: sessionId });
  }

  async deleteByToken(token: string): Promise<void> {
    await this.sessions.deleteOne({ tokenHash: hashToken(token) });
  }

  private nextExpiry(now: Date, absoluteExpiresAt: Date): Date {
    return new Date(Math.min(now.getTime() + this.idleMs, absoluteExpiresAt.getTime()));
  }
}
