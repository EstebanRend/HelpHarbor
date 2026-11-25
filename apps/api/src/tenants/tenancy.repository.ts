import { Inject, Injectable } from "@nestjs/common";
import type { Role } from "@helpharbor/contracts";
import type { Collection, Db, ObjectId } from "mongodb";
import { MONGO_DB } from "../database/database.module";
import { Collections, type MembershipDoc, type TenantDoc, type UserDoc } from "../database/documents";
import { TenantScopedCollection } from "../database/tenant-scoped-collection";

export interface MembershipWithTenant {
  tenant: TenantDoc;
  role: Role;
}

export interface MemberWithUser {
  user: UserDoc;
  role: Role;
  joinedAt: Date;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Reads tenants, users and memberships. Tenant-owned queries go through `TenantScopedCollection`. */
@Injectable()
export class TenancyRepository {
  private readonly tenants: Collection<TenantDoc>;
  private readonly users: Collection<UserDoc>;
  private readonly memberships: TenantScopedCollection<MembershipDoc>;
  /** Unscoped on purpose: lists one user's own memberships across tenants at sign-in. */
  private readonly membershipsByUser: Collection<MembershipDoc>;

  constructor(@Inject(MONGO_DB) db: Db) {
    this.tenants = db.collection<TenantDoc>(Collections.tenants);
    this.users = db.collection<UserDoc>(Collections.users);
    this.membershipsByUser = db.collection<MembershipDoc>(Collections.memberships);
    this.memberships = new TenantScopedCollection(this.membershipsByUser);
  }

  findUserByEmail(email: string): Promise<UserDoc | null> {
    return this.users.findOne({ emailNormalized: normalizeEmail(email) });
  }

  findUserById(id: ObjectId): Promise<UserDoc | null> {
    return this.users.findOne({ _id: id });
  }

  findTenantById(id: ObjectId): Promise<TenantDoc | null> {
    return this.tenants.findOne({ _id: id });
  }

  /** The user's role in one tenant, or null when they are not a member. */
  async findRole(tenantId: ObjectId, userId: ObjectId): Promise<Role | null> {
    const membership = await this.memberships.findOne({ tenantId, userId }, { projection: { role: 1 } });
    return membership?.role ?? null;
  }

  /** All tenants the user belongs to, ordered by tenant name. */
  async listMembershipsForUser(userId: ObjectId): Promise<MembershipWithTenant[]> {
    const memberships = await this.membershipsByUser.find({ userId }).toArray();
    if (memberships.length === 0) return [];
    const tenants = await this.tenants.find({ _id: { $in: memberships.map((m) => m.tenantId) } }).toArray();
    const byId = new Map(tenants.map((t) => [t._id.toHexString(), t]));
    return memberships
      .flatMap((m) => {
        const tenant = byId.get(m.tenantId.toHexString());
        return tenant ? [{ tenant, role: m.role }] : [];
      })
      .sort((a, b) => a.tenant.name.localeCompare(b.tenant.name));
  }

  /** Members of one tenant, ordered by display name. */
  async listMembers(tenantId: ObjectId): Promise<MemberWithUser[]> {
    const memberships = await this.memberships.find({ tenantId }).toArray();
    const users = await this.users.find({ _id: { $in: memberships.map((m) => m.userId) } }).toArray();
    const byId = new Map(users.map((u) => [u._id.toHexString(), u]));
    return memberships
      .flatMap((m) => {
        const user = byId.get(m.userId.toHexString());
        return user ? [{ user, role: m.role, joinedAt: m.createdAt }] : [];
      })
      .sort((a, b) => a.user.displayName.localeCompare(b.user.displayName));
  }
}
