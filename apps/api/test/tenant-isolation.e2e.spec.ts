import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  CSRF_HEADER_NAME,
  ErrorEnvelopeSchema,
  PERMISSIONS,
  type Permission,
  type Role,
  SessionResponseSchema,
  type SessionResponse,
  hasPermission,
} from "@helpharbor/contracts";
import { type Db, MongoClient, ObjectId } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import type TestAgent from "supertest/lib/agent";
import { AppModule } from "../src/app.module";
import { PasswordService } from "../src/auth/password.service";
import { APP_CONFIG, loadConfig } from "../src/config/env";
import { configureApp } from "../src/configure-app";
import { Collections } from "../src/database/documents";
import { ensureCollections } from "../src/database/schema";
import { DEMO_TENANTS, DEMO_USERS, seedDemoIdentities } from "../src/seed/demo-identities";
import { NotesProbeController, PermissionProbeController, probePath } from "./support/probe-controllers";

const PASSWORD = "tenant walls hold firm";

const ACME = DEMO_TENANTS[0];
const GLOBEX = DEMO_TENANTS[1];

const user = (prefix: string) => {
  const found = DEMO_USERS.find((u) => u.email.startsWith(`${prefix}.`));
  if (!found) throw new Error(`no demo user ${prefix}`);
  return found;
};

/** Every (user, workspace, role) in the seed: the rows the role matrix is checked against. */
const MEMBERSHIPS = DEMO_USERS.flatMap((u) =>
  u.memberships.map((m) => ({ email: u.email, tenant: m.tenant, role: m.role as Role })),
);

/** Rows of the persona role matrix (`docs/product/personas.md`) and the permission each one is. */
const PERSONA_ROWS: Record<string, Permission> = {
  "Read tenant tickets": "tickets:read",
  "Public reply / internal note": "tickets:reply",
  "Reassign to others, change priority": "tickets:assign_others",
  "Edit calendar and SLA policies": "sla:manage",
  "Create KB drafts": "kb:draft",
  "Publish KB articles": "kb:publish",
  "Read reports": "reports:read",
  "Manage members and roles": "members:manage",
};

describe("persona role matrix document", () => {
  const doc = readFileSync(resolve(__dirname, "../../../docs/product/personas.md"), "utf8");
  const section = doc.slice(doc.indexOf("## Role matrix"));
  const rows = section
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| Action") && !line.startsWith("|---"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));

  it("has exactly one row per permission", () => {
    expect(rows.map(([action]) => action).sort()).toEqual(Object.keys(PERSONA_ROWS).sort());
    expect(Object.values(PERSONA_ROWS).sort()).toEqual([...PERMISSIONS].sort());
  });

  it.each(rows.map((row) => [row[0]!, row] as const))("matches ROLE_PERMISSIONS for %s", (action, row) => {
    const permission = PERSONA_ROWS[action]!;
    const [, admin, lead, agent] = row;
    expect({ admin: admin === "✓", lead: lead === "✓", agent: agent === "✓" }).toEqual({
      admin: hasPermission("admin", permission),
      lead: hasPermission("lead", permission),
      agent: hasPermission("agent", permission),
    });
  });
});

describe("tenant isolation and role matrix (MongoDB)", () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  let app: INestApplication;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri("helpharbor_isolation_test");
    client = await new MongoClient(uri).connect();
    db = client.db();
    await ensureCollections(db);
    await seedDemoIdentities(db, PASSWORD, new PasswordService());

    const config = loadConfig({ NODE_ENV: "test", MONGODB_URI: uri, REDIS_URL: "redis://localhost:6379" });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [PermissionProbeController, NotesProbeController],
    })
      .overrideProvider(APP_CONFIG)
      .useValue(config)
      .compile();
    app = configureApp(moduleRef.createNestApplication(), config);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await client?.close();
    await mongod?.stop();
  });

  interface Signed {
    agent: TestAgent;
    session: SessionResponse;
    /** Sends a state-changing request with the session's CSRF token. */
    write: (method: "post" | "patch" | "delete", path: string, body?: object) => request.Test;
  }

  async function signIn(email: string, tenantSlug?: string): Promise<Signed> {
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD, ...(tenantSlug ? { tenantSlug } : {}) })
      .expect(200);
    const session = SessionResponseSchema.parse(res.body);
    const write = (method: "post" | "patch" | "delete", path: string, body?: object) => {
      const req = agent[method](path).set(CSRF_HEADER_NAME, session.csrfToken);
      return body ? req.send(body) : req;
    };
    return { agent, session, write };
  }

  const errorCode = (body: unknown) => ErrorEnvelopeSchema.parse(body).error.code;

  describe("role matrix", () => {
    it("covers every role in both workspaces", () => {
      const seen = new Set(MEMBERSHIPS.map((m) => `${m.role}@${m.tenant}`));
      for (const tenant of DEMO_TENANTS) {
        for (const role of ["admin", "lead", "agent"] as const) expect(seen).toContain(`${role}@${tenant.slug}`);
      }
    });

    it.each(MEMBERSHIPS.map((m) => [`${m.email} as ${m.role} in ${m.tenant}`, m] as const))(
      "%s: every permission is allowed or refused as the matrix says",
      async (_label, membership) => {
        const { session, agent, write } = await signIn(membership.email, membership.tenant);
        expect(session.activeTenant).toMatchObject({ tenant: { slug: membership.tenant }, role: membership.role });

        const expected: Record<string, number> = {};
        const actual: Record<string, number> = {};
        for (const permission of PERMISSIONS) {
          const status = hasPermission(membership.role, permission) ? 200 : 403;
          const read = await agent.get(probePath(permission));
          const change = await write("post", probePath(permission));
          expected[`GET ${permission}`] = status;
          expected[`POST ${permission}`] = status === 200 ? 201 : 403;
          actual[`GET ${permission}`] = read.status;
          actual[`POST ${permission}`] = change.status;
          if (read.status === 403) expect(errorCode(read.body)).toBe("forbidden");
        }
        expect(actual).toEqual(expected);

        const members = await agent.get("/api/v1/tenant/members");
        expect(members.status).toBe(hasPermission(membership.role, "members:manage") ? 200 : 403);
      },
    );

    it("checks the role before the handler runs, even with a valid CSRF token", async () => {
      const ana = await signIn(user("ana").email);
      const res = await ana.write("delete", `/api/v1/probe/notes/${new ObjectId().toHexString()}`).expect(403);
      expect(errorCode(res.body)).toBe("forbidden");
    });

    it("applies a role change on the next request", async () => {
      const luis = user("luis");
      const memberships = db.collection(Collections.memberships);
      const filter = { tenantId: new ObjectId(ACME._id), userId: new ObjectId(luis._id) };
      const { agent } = await signIn(luis.email);
      await agent.get(probePath("tickets:assign_others")).expect(200);

      await memberships.updateOne(filter, { $set: { role: "agent" } });
      try {
        await agent.get(probePath("tickets:assign_others")).expect(403);
        await agent.get("/api/v1/tenant").expect(200).expect((res) => expect(res.body.role).toBe("agent"));
      } finally {
        await memberships.updateOne(filter, { $set: { role: "lead" } });
      }
      await agent.get(probePath("tickets:assign_others")).expect(200);
    });

    it("requires a session before any role check", async () => {
      for (const permission of PERMISSIONS) {
        const res = await request(app.getHttpServer()).get(probePath(permission)).expect(401);
        expect(errorCode(res.body)).toBe("unauthenticated");
      }
    });
  });

  describe("cross-tenant reads and writes", () => {
    let acmeNoteId: string;

    beforeAll(async () => {
      const marta = await signIn(user("marta").email);
      const res = await marta.write("post", "/api/v1/probe/notes", { body: "Acme internal note" }).expect(201);
      acmeNoteId = res.body.id;
    });

    it("cannot read another tenant's document by id; it looks missing", async () => {
      const grace = await signIn(user("grace").email);
      const res = await grace.agent.get(`/api/v1/probe/notes/${acmeNoteId}`).expect(404);
      expect(errorCode(res.body)).toBe("not_found");
      expect(res.body.error.message).toBe("Note not found");

      const missing = await grace.agent.get(`/api/v1/probe/notes/${new ObjectId().toHexString()}`).expect(404);
      expect(missing.body.error.message).toBe(res.body.error.message);
    });

    it("does not list another tenant's documents", async () => {
      const hugo = await signIn(user("hugo").email);
      await hugo.write("post", "/api/v1/probe/notes", { body: "Globex note" }).expect(201);

      const globex = await hugo.agent.get("/api/v1/probe/notes").expect(200);
      expect(globex.body.map((n: { body: string }) => n.body)).toEqual(["Globex note"]);
      expect(globex.body.every((n: { tenantId: string }) => n.tenantId === GLOBEX._id)).toBe(true);

      const luis = await signIn(user("luis").email);
      const acme = await luis.agent.get("/api/v1/probe/notes").expect(200);
      expect(acme.body.map((n: { body: string }) => n.body)).not.toContain("Globex note");
    });

    it("cannot update or delete another tenant's document", async () => {
      const grace = await signIn(user("grace").email);
      await grace.write("patch", `/api/v1/probe/notes/${acmeNoteId}`, { body: "overwritten" }).expect(404);
      await grace.write("delete", `/api/v1/probe/notes/${acmeNoteId}`).expect(404);

      const stored = await db.collection("probe_notes").findOne({ _id: new ObjectId(acmeNoteId) });
      expect(stored).toMatchObject({ body: "Acme internal note", tenantId: new ObjectId(ACME._id) });
    });

    it("ignores a tenant id sent in the body, query or headers", async () => {
      const pedro = await signIn(user("pedro").email);
      const created = await pedro
        .write("post", `/api/v1/probe/notes?tenantId=${GLOBEX._id}`, { body: "smuggled", tenantId: GLOBEX._id })
        .set("x-tenant-id", GLOBEX._id)
        .expect(201);
      const stored = await db.collection("probe_notes").findOne({ _id: new ObjectId(created.body.id) });
      expect(stored?.tenantId).toEqual(new ObjectId(ACME._id));

      const current = await pedro.agent
        .get(`/api/v1/tenant?tenantId=${GLOBEX._id}&tenant=${GLOBEX.slug}`)
        .set("x-tenant-id", GLOBEX._id)
        .expect(200);
      expect(current.body.tenant.slug).toBe(ACME.slug);
    });

    it("scopes a multi-workspace user to the active workspace only", async () => {
      const ana = await signIn(user("ana").email);
      const created = await ana.write("post", "/api/v1/probe/notes", { body: "Ana in Acme" }).expect(201);
      await ana.agent.get(`/api/v1/probe/notes/${created.body.id}`).expect(200);

      await ana.write("post", "/api/v1/auth/switch-tenant", { tenantSlug: GLOBEX.slug }).expect(200);
      await ana.agent.get(`/api/v1/probe/notes/${created.body.id}`).expect(404);
      const inGlobex = await ana.agent.get("/api/v1/probe/notes").expect(200);
      expect(inGlobex.body.map((n: { body: string }) => n.body)).not.toContain("Ana in Acme");

      await ana.write("post", "/api/v1/auth/switch-tenant", { tenantSlug: ACME.slug }).expect(200);
      await ana.agent.get(`/api/v1/probe/notes/${created.body.id}`).expect(200);
    });

    it("refuses a session whose active workspace was tampered with", async () => {
      const marta = await signIn(user("marta").email);
      await db
        .collection(Collections.sessions)
        .updateOne({ csrfToken: marta.session.csrfToken }, { $set: { activeTenantId: new ObjectId(GLOBEX._id) } });

      const res = await marta.agent.get("/api/v1/probe/notes").expect(403);
      expect(errorCode(res.body)).toBe("no_workspace");
      await marta.agent.get("/api/v1/tenant/members").expect(403);

      // Reading the session repairs it back to a workspace she belongs to.
      const session = SessionResponseSchema.parse((await marta.agent.get("/api/v1/auth/session").expect(200)).body);
      expect(session.activeTenant?.tenant.slug).toBe(ACME.slug);
      await marta.agent.get("/api/v1/probe/notes").expect(200);
    });

    it("rejects malformed ids as not found rather than an error", async () => {
      const luis = await signIn(user("luis").email);
      const res = await luis.agent.get("/api/v1/probe/notes/%7B%22%24ne%22%3Anull%7D").expect(404);
      expect(errorCode(res.body)).toBe("not_found");
    });
  });
});
