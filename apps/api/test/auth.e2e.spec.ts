import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  CSRF_HEADER_NAME,
  ErrorEnvelopeSchema,
  SESSION_COOKIE_NAME,
  SessionResponseSchema,
  TenantMembersResponseSchema,
  type SessionResponse,
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

const PASSWORD = "harbor lights at dusk";
const WEB_ORIGIN = "http://localhost:3000";

const email = (prefix: string) => {
  const user = DEMO_USERS.find((u) => u.email.startsWith(prefix));
  if (!user) throw new Error(`no demo user ${prefix}`);
  return user.email;
};

describe("auth and tenancy (MongoDB)", () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  let app: INestApplication;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri("helpharbor_auth_test");
    client = await new MongoClient(uri).connect();
    db = client.db();
    await ensureCollections(db);
    await seedDemoIdentities(db, PASSWORD, new PasswordService());

    const config = loadConfig({ NODE_ENV: "test", MONGODB_URI: uri, REDIS_URL: "redis://localhost:6379" });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
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

  const http = () => request(app.getHttpServer());

  async function signIn(
    userEmail: string,
    tenantSlug?: string,
  ): Promise<{ agent: TestAgent; session: SessionResponse; cookie: string }> {
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post("/api/v1/auth/login")
      .set("Origin", WEB_ORIGIN)
      .send({ email: userEmail, password: PASSWORD, ...(tenantSlug ? { tenantSlug } : {}) })
      .expect(200);
    const cookie = String(res.headers["set-cookie"]).split(";")[0]!;
    return { agent, session: SessionResponseSchema.parse(res.body), cookie };
  }

  function errorCode(body: unknown): string {
    return ErrorEnvelopeSchema.parse(body).error.code;
  }

  describe("login", () => {
    it("sets an httpOnly, SameSite=Lax session cookie and returns the session", async () => {
      const res = await http()
        .post("/api/v1/auth/login")
        .set("Origin", WEB_ORIGIN)
        .send({ email: "  Marta.Admin@Acme-Cloud.example ", password: PASSWORD })
        .expect(200);
      const cookie = String(res.headers["set-cookie"]);
      expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Lax/);
      expect(cookie).toMatch(/Path=\//);
      expect(cookie).not.toMatch(/Secure/);
      expect(res.headers["cache-control"]).toBe("no-store");

      const session = SessionResponseSchema.parse(res.body);
      expect(session.user.displayName).toBe("Marta Ruiz");
      expect(session.activeTenant).toMatchObject({ tenant: { slug: "acme-cloud" }, role: "admin" });
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    });

    it("stores only a hash of the session token", async () => {
      const res = await http()
        .post("/api/v1/auth/login")
        .send({ email: email("luis"), password: PASSWORD })
        .expect(200);
      const token = String(res.headers["set-cookie"]).match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`))?.[1];
      expect(token).toBeDefined();
      expect(await db.collection(Collections.sessions).countDocuments({ tokenHash: token })).toBe(0);
    });

    it("answers wrong password and unknown email identically", async () => {
      const wrong = await http().post("/api/v1/auth/login").send({ email: email("ana"), password: "nope nope nope" });
      const unknown = await http()
        .post("/api/v1/auth/login")
        .send({ email: "nobody@acme-cloud.example", password: PASSWORD });
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(errorCode(wrong.body)).toBe("invalid_credentials");
      expect(wrong.body.error.message).toBe(unknown.body.error.message);
      expect(wrong.headers["set-cookie"]).toBeUndefined();
    });

    it("rejects NoSQL operators and unknown fields with validation errors", async () => {
      const res = await http()
        .post("/api/v1/auth/login")
        .send({ email: { $ne: null }, password: { $gt: "" }, role: "admin" })
        .expect(400);
      const envelope = ErrorEnvelopeSchema.parse(res.body);
      expect(envelope.error.code).toBe("validation_failed");
      expect(envelope.error.details?.map((d) => d.path)).toEqual(expect.arrayContaining(["email", "password"]));
      expect(envelope.error.requestId).toBe(res.headers["x-request-id"]);
    });

    it("refuses a login posted from another origin", async () => {
      const res = await http()
        .post("/api/v1/auth/login")
        .set("Origin", "https://evil.example")
        .send({ email: email("marta"), password: PASSWORD })
        .expect(403);
      expect(errorCode(res.body)).toBe("origin_not_allowed");
    });

    it("opens the requested workspace, or 404 when the user is not a member", async () => {
      const { session } = await signIn(email("ana"), "globex-hosting");
      expect(session.activeTenant?.tenant.slug).toBe("globex-hosting");
      expect(session.memberships.map((m) => m.tenant.slug)).toEqual(["acme-cloud", "globex-hosting"]);

      const res = await http()
        .post("/api/v1/auth/login")
        .send({ email: email("marta"), password: PASSWORD, tenantSlug: "globex-hosting" })
        .expect(404);
      expect(errorCode(res.body)).toBe("not_found");
    });

    it("replaces a session the browser already had", async () => {
      const { agent } = await signIn(email("pedro"));
      const before = await db.collection(Collections.sessions).countDocuments({ userId: new ObjectId(DEMO_USERS[3]!._id) });
      await agent.post("/api/v1/auth/login").send({ email: email("pedro"), password: PASSWORD }).expect(200);
      const after = await db.collection(Collections.sessions).countDocuments({ userId: new ObjectId(DEMO_USERS[3]!._id) });
      expect(after).toBe(before);
    });
  });

  describe("sessions", () => {
    it("requires a session cookie", async () => {
      const res = await http().get("/api/v1/auth/session").expect(401);
      expect(errorCode(res.body)).toBe("unauthenticated");
    });

    it("treats an unknown cookie as an expired session and clears it", async () => {
      const res = await http()
        .get("/api/v1/auth/session")
        .set("Cookie", `${SESSION_COOKIE_NAME}=forged-token`)
        .expect(401);
      expect(errorCode(res.body)).toBe("session_expired");
      expect(String(res.headers["set-cookie"])).toMatch(new RegExp(`${SESSION_COOKIE_NAME}=;`));
    });

    it("expires sessions after the idle timeout and deletes them", async () => {
      const { agent, session } = await signIn(email("luis"));
      await agent.get("/api/v1/auth/session").expect(200);
      const sessions = db.collection(Collections.sessions);
      await sessions.updateOne({ csrfToken: session.csrfToken }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

      const res = await agent.get("/api/v1/auth/session").expect(401);
      expect(errorCode(res.body)).toBe("session_expired");
      expect(await sessions.countDocuments({ csrfToken: session.csrfToken })).toBe(0);
    });

    it("ends the session on logout, so a copied cookie stops working", async () => {
      const { agent, session, cookie } = await signIn(email("tomas"));
      const res = await agent.post("/api/v1/auth/logout").set(CSRF_HEADER_NAME, session.csrfToken).expect(204);
      expect(String(res.headers["set-cookie"])).toMatch(new RegExp(`${SESSION_COOKIE_NAME}=;`));
      expect(errorCode((await agent.get("/api/v1/auth/session").expect(401)).body)).toBe("unauthenticated");

      const replay = await http().get("/api/v1/auth/session").set("Cookie", cookie).expect(401);
      expect(errorCode(replay.body)).toBe("session_expired");
    });

    it("ends sessions of a disabled user", async () => {
      const users = db.collection(Collections.users);
      const hugo = new ObjectId(DEMO_USERS.find((u) => u.email.startsWith("hugo"))!._id);
      const { agent } = await signIn(email("hugo"));
      await users.updateOne({ _id: hugo }, { $set: { disabledAt: new Date() } });
      try {
        await agent.get("/api/v1/tenant").expect(401);
        await http().post("/api/v1/auth/login").send({ email: email("hugo"), password: PASSWORD }).expect(401);
      } finally {
        await users.updateOne({ _id: hugo }, { $set: { disabledAt: null } });
      }
    });
  });

  describe("CSRF", () => {
    it("requires the session's token on state-changing requests", async () => {
      const { agent, session } = await signIn(email("ana"));
      const missing = await agent.post("/api/v1/auth/switch-tenant").send({ tenantSlug: "globex-hosting" }).expect(403);
      expect(errorCode(missing.body)).toBe("csrf_token_invalid");

      const { session: other } = await signIn(email("pedro"));
      await agent
        .post("/api/v1/auth/switch-tenant")
        .set(CSRF_HEADER_NAME, other.csrfToken)
        .send({ tenantSlug: "globex-hosting" })
        .expect(403);

      await agent
        .post("/api/v1/auth/logout")
        .set("Origin", "https://evil.example")
        .set(CSRF_HEADER_NAME, session.csrfToken)
        .expect(403);
      await agent.get("/api/v1/auth/session").expect(200);
    });
  });

  describe("tenant scoping and roles", () => {
    it("serves the active workspace with the caller's role", async () => {
      const { agent } = await signIn(email("ana"));
      const res = await agent.get("/api/v1/tenant").expect(200);
      expect(res.body).toMatchObject({
        tenant: { slug: "acme-cloud" },
        role: "agent",
        permissions: ["tickets:read", "tickets:reply"],
      });
    });

    it.each([
      ["marta", 200],
      ["luis", 403],
      ["ana", 403],
    ])("lets only admins list members (%s → %i)", async (prefix, status) => {
      const { agent } = await signIn(email(prefix));
      const res = await agent.get("/api/v1/tenant/members").expect(status);
      if (status === 403) expect(errorCode(res.body)).toBe("forbidden");
    });

    it("lists members of the active tenant only", async () => {
      const { agent } = await signIn(email("marta"));
      const res = await agent.get("/api/v1/tenant/members").expect(200);
      const body = TenantMembersResponseSchema.parse(res.body);
      expect(body.tenant.slug).toBe("acme-cloud");
      expect(body.members.map((m) => m.email).sort()).toEqual(
        DEMO_USERS.filter((u) => u.memberships.some((m) => m.tenant === "acme-cloud"))
          .map((u) => u.email)
          .sort(),
      );
      expect(body.members.some((m) => m.email.endsWith("@globex-hosting.example"))).toBe(false);
    });

    it("switches workspaces only between the user's own memberships", async () => {
      const { agent, session } = await signIn(email("ana"));
      const switched = await agent
        .post("/api/v1/auth/switch-tenant")
        .set(CSRF_HEADER_NAME, session.csrfToken)
        .send({ tenantSlug: "globex-hosting" })
        .expect(200);
      expect(SessionResponseSchema.parse(switched.body).activeTenant?.tenant.slug).toBe("globex-hosting");
      await agent.get("/api/v1/tenant").expect(200).expect((res) => expect(res.body.tenant.slug).toBe("globex-hosting"));

      const marta = await signIn(email("marta"));
      const denied = await marta.agent
        .post("/api/v1/auth/switch-tenant")
        .set(CSRF_HEADER_NAME, marta.session.csrfToken)
        .send({ tenantSlug: "globex-hosting" })
        .expect(404);
      expect(errorCode(denied.body)).toBe("not_found");
      await marta.agent.get("/api/v1/tenant").expect(200).expect((res) => expect(res.body.tenant.slug).toBe("acme-cloud"));
    });

    it("applies a removed membership on the next request", async () => {
      const pedro = DEMO_USERS.find((u) => u.email.startsWith("pedro"))!;
      const acme = new ObjectId(DEMO_TENANTS[0]._id);
      const memberships = db.collection(Collections.memberships);
      const { agent } = await signIn(pedro.email);
      await memberships.deleteOne({ tenantId: acme, userId: new ObjectId(pedro._id) });
      try {
        const res = await agent.get("/api/v1/tenant").expect(403);
        expect(errorCode(res.body)).toBe("no_workspace");
        const session = SessionResponseSchema.parse((await agent.get("/api/v1/auth/session").expect(200)).body);
        expect(session.activeTenant).toBeNull();
        expect(session.memberships).toEqual([]);
      } finally {
        await memberships.insertOne({ tenantId: acme, userId: new ObjectId(pedro._id), role: "agent", createdAt: new Date() });
      }
    });
  });

  describe("database rules", () => {
    it("rejects memberships with an unknown role or a duplicate (tenant, user)", async () => {
      const memberships = db.collection(Collections.memberships);
      const tenantId = new ObjectId(DEMO_TENANTS[0]._id);
      await expect(
        memberships.insertOne({ tenantId, userId: new ObjectId(), role: "owner", createdAt: new Date() }),
      ).rejects.toThrow(/Document failed validation/);
      await expect(
        memberships.insertOne({ tenantId, userId: new ObjectId(DEMO_USERS[0]!._id), role: "agent", createdAt: new Date() }),
      ).rejects.toThrow(/duplicate key/);
    });

    it("reseeds without changing anything", async () => {
      const snapshot = async () => ({
        tenants: await db.collection(Collections.tenants).find().sort({ _id: 1 }).toArray(),
        users: await db.collection(Collections.users).find().sort({ _id: 1 }).toArray(),
        memberships: await db
          .collection(Collections.memberships)
          .find({}, { projection: { _id: 0, createdAt: 0 } })
          .sort({ tenantId: 1, userId: 1 })
          .toArray(),
      });
      const before = await snapshot();
      await seedDemoIdentities(db, PASSWORD, new PasswordService());
      expect(await snapshot()).toEqual(before);
    });
  });
});
