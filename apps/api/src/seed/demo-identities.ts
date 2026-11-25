import type { Role } from "@helpharbor/contracts";
import { type Db, ObjectId } from "mongodb";
import { Collections, type MembershipDoc, type TenantDoc, type UserDoc } from "../database/documents";

/**
 * Synthetic demo workspaces and staff. Every name, company and address is
 * fictional; emails use the reserved `.example` domain. Ids are fixed so a
 * reseed updates the same documents instead of creating new ones.
 */
export const DEMO_TENANTS = [
  { _id: "6741a0000000000000000001", slug: "acme-cloud", name: "Acme Cloud", timezone: "Europe/Madrid" },
  { _id: "6741a0000000000000000002", slug: "globex-hosting", name: "Globex Hosting", timezone: "America/Bogota" },
] as const;

type DemoTenantSlug = (typeof DEMO_TENANTS)[number]["slug"];

export const DEMO_USERS: ReadonlyArray<{
  _id: string;
  email: string;
  displayName: string;
  memberships: ReadonlyArray<{ tenant: DemoTenantSlug; role: Role }>;
}> = [
  { _id: "6741a0000000000000000101", email: "marta.admin@acme-cloud.example", displayName: "Marta Ruiz", memberships: [{ tenant: "acme-cloud", role: "admin" }] },
  { _id: "6741a0000000000000000102", email: "luis.lead@acme-cloud.example", displayName: "Luis Ortega", memberships: [{ tenant: "acme-cloud", role: "lead" }] },
  {
    _id: "6741a0000000000000000103",
    email: "ana.agent@acme-cloud.example",
    displayName: "Ana Gómez",
    // Ana also covers Globex, so the workspace switcher has something to switch.
    memberships: [
      { tenant: "acme-cloud", role: "agent" },
      { tenant: "globex-hosting", role: "agent" },
    ],
  },
  { _id: "6741a0000000000000000104", email: "pedro.agent@acme-cloud.example", displayName: "Pedro Lara", memberships: [{ tenant: "acme-cloud", role: "agent" }] },
  { _id: "6741a0000000000000000201", email: "grace.admin@globex-hosting.example", displayName: "Grace Okafor", memberships: [{ tenant: "globex-hosting", role: "admin" }] },
  { _id: "6741a0000000000000000202", email: "hugo.lead@globex-hosting.example", displayName: "Hugo Brandt", memberships: [{ tenant: "globex-hosting", role: "lead" }] },
  { _id: "6741a0000000000000000203", email: "tomas.agent@globex-hosting.example", displayName: "Tomás Vidal", memberships: [{ tenant: "globex-hosting", role: "agent" }] },
];

const WEAK_PREFIXES = ["change-me", "changeme", "password"];

/** Demo passwords come from the environment; refuse anything short or left at a template value. */
export function assertUsableDemoPassword(password: string | undefined): asserts password is string {
  if (!password || password.length < 12) {
    throw new Error("SEED_DEMO_PASSWORD must be set to at least 12 characters");
  }
  if (WEAK_PREFIXES.some((prefix) => password.toLowerCase().startsWith(prefix))) {
    throw new Error("SEED_DEMO_PASSWORD still has a placeholder value; choose your own");
  }
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string | undefined, password: string): Promise<boolean>;
}

export interface SeedSummary {
  tenants: number;
  users: number;
  memberships: number;
}

/** Upserts the demo tenants, users and memberships. Running it twice changes nothing. */
export async function seedDemoIdentities(db: Db, password: string, hasher: PasswordHasher, now = new Date()): Promise<SeedSummary> {
  assertUsableDemoPassword(password);
  const tenants = db.collection<TenantDoc>(Collections.tenants);
  const users = db.collection<UserDoc>(Collections.users);
  const memberships = db.collection<MembershipDoc>(Collections.memberships);
  const tenantIds = new Map<string, ObjectId>();

  for (const tenant of DEMO_TENANTS) {
    const _id = new ObjectId(tenant._id);
    tenantIds.set(tenant.slug, _id);
    await tenants.updateOne(
      { _id },
      { $set: { slug: tenant.slug, name: tenant.name, timezone: tenant.timezone }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
  }

  let membershipCount = 0;
  for (const user of DEMO_USERS) {
    const _id = new ObjectId(user._id);
    const existing = await users.findOne({ _id }, { projection: { passwordHash: 1 } });
    // Only rehash when the configured password changed, so reseeding is a no-op.
    const keepHash = existing && (await hasher.verify(existing.passwordHash, password));
    const passwordHash = keepHash ? existing.passwordHash : await hasher.hash(password);
    await users.updateOne(
      { _id },
      {
        $set: { emailNormalized: user.email, displayName: user.displayName, passwordHash, disabledAt: null },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    for (const membership of user.memberships) {
      const tenantId = tenantIds.get(membership.tenant);
      if (!tenantId) throw new Error(`unknown demo tenant ${membership.tenant}`);
      await memberships.updateOne(
        { tenantId, userId: _id },
        { $set: { role: membership.role }, $setOnInsert: { createdAt: now } },
        { upsert: true },
      );
      membershipCount += 1;
    }
  }

  return { tenants: DEMO_TENANTS.length, users: DEMO_USERS.length, memberships: membershipCount };
}
