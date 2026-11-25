import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  ErrorEnvelopeSchema,
  INBOUND_SIGNATURE_HEADER,
  InboundEmailResultSchema,
  MessageListResponseSchema,
  TicketDetailSchema,
  TicketListResponseSchema,
  type InboundEmailInput,
  type InboundEmailResult,
  type TicketView,
} from "@helpharbor/contracts";
import { type Db, MongoClient, ObjectId } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import type TestAgent from "supertest/lib/agent";
import { AppModule } from "../src/app.module";
import { PasswordService } from "../src/auth/password.service";
import { APP_CONFIG, loadConfig } from "../src/config/env";
import { configureApp } from "../src/configure-app";
import { Collections, type TicketDoc } from "../src/database/documents";
import { ensureCollections } from "../src/database/schema";
import { signInboundRequest } from "../src/inbound/signature";
import { DEMO_USERS, seedDemoIdentities } from "../src/seed/demo-identities";

const PASSWORD = "inbound tide rolls in";
const SECRET = "test-inbound-secret-0123456789abcdef";
const DOMAIN = "inbound.helpharbor.example";
const ACME = `acme-cloud@${DOMAIN}`;
const GLOBEX = `globex-hosting@${DOMAIN}`;

const TICKET_COLLECTIONS = [
  Collections.counters,
  Collections.customers,
  Collections.tickets,
  Collections.messages,
  Collections.ticketEvents,
  Collections.outboxEvents,
];

const staff = (prefix: string) => {
  const user = DEMO_USERS.find((u) => u.email.startsWith(`${prefix}.`));
  if (!user) throw new Error(`no demo user ${prefix}`);
  return user.email;
};

let seq = 0;
/** A fresh, valid inbound email; every call gets its own Message-ID. */
function mail(overrides: Partial<InboundEmailInput> = {}): InboundEmailInput {
  seq += 1;
  return {
    messageId: `<m${seq}.${Date.now()}@mail.northwind.example>`,
    from: { email: "dana.pike@northwind.example", name: "Dana Pike" },
    to: ACME,
    subject: "Invoice question",
    text: "Where can I download last month's invoice?",
    sentAt: new Date(Date.UTC(2026, 10, 20, 9, 0, seq)).toISOString(),
    ...overrides,
  };
}

describe("tickets and inbound email (MongoDB replica set)", () => {
  let replSet: MongoMemoryReplSet;
  let client: MongoClient;
  let db: Db;
  let app: INestApplication;

  beforeAll(async () => {
    // Transactions need a replica set, as in Compose.
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
    const uri = replSet.getUri("helpharbor_tickets_test");
    client = await new MongoClient(uri).connect();
    db = client.db();
    await ensureCollections(db);
    await seedDemoIdentities(db, PASSWORD, new PasswordService());

    const config = loadConfig({
      NODE_ENV: "test",
      MONGODB_URI: uri,
      REDIS_URL: "redis://localhost:6379",
      INBOUND_WEBHOOK_SECRET: SECRET,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(config)
      .compile();
    app = configureApp(moduleRef.createNestApplication({ rawBody: true }), config);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await client?.close();
    await replSet?.stop();
  });

  beforeEach(async () => {
    for (const name of TICKET_COLLECTIONS) await db.collection(name).deleteMany({});
  });

  const http = () => request(app.getHttpServer());
  const count = (name: string, filter: object = {}) => db.collection(name).countDocuments(filter);
  const errorCode = (body: unknown) => ErrorEnvelopeSchema.parse(body).error.code;

  function deliver(payload: unknown, options: { secret?: string; at?: Date; raw?: string } = {}) {
    const raw = options.raw ?? JSON.stringify(payload);
    return http()
      .post("/api/v1/inbound/email")
      .set("Content-Type", "application/json")
      .set(INBOUND_SIGNATURE_HEADER, signInboundRequest(options.secret ?? SECRET, raw, options.at))
      .send(raw);
  }

  async function ingest(payload: InboundEmailInput, expectedStatus = 201): Promise<InboundEmailResult> {
    const res = await deliver(payload);
    expect(res.status).toBe(expectedStatus);
    return InboundEmailResultSchema.parse(res.body);
  }

  const ticketDoc = (id: string) => db.collection<TicketDoc>(Collections.tickets).findOne({ _id: new ObjectId(id) });

  async function signIn(email: string, tenantSlug?: string): Promise<TestAgent> {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD, ...(tenantSlug ? { tenantSlug } : {}) })
      .expect(200);
    return agent;
  }

  describe("webhook authentication", () => {
    it("rejects missing, wrong-secret, expired and tampered signatures without storing anything", async () => {
      const payload = mail();
      const raw = JSON.stringify(payload);
      const unsigned = await http().post("/api/v1/inbound/email").set("Content-Type", "application/json").send(raw);
      const wrongSecret = await deliver(payload, { secret: "another-secret-another-secret-123456" });
      const expired = await deliver(payload, { at: new Date(Date.now() - 10 * 60_000) });
      const tampered = await http()
        .post("/api/v1/inbound/email")
        .set("Content-Type", "application/json")
        .set(INBOUND_SIGNATURE_HEADER, signInboundRequest(SECRET, raw))
        .send(raw.replace("Invoice question", "Refund me now"));

      for (const res of [unsigned, wrongSecret, expired, tampered]) {
        expect(res.status).toBe(401);
        expect(errorCode(res.body)).toBe("invalid_signature");
      }
      expect(await count(Collections.messages)).toBe(0);
    });

    it("checks the signature before validating the body", async () => {
      const res = await http()
        .post("/api/v1/inbound/email")
        .set("Content-Type", "application/json")
        .send(JSON.stringify({ nonsense: true }));
      expect(res.status).toBe(401);
    });

    it("refuses non-JSON, malformed and oversized bodies with 4xx, not 500", async () => {
      const form = await http()
        .post("/api/v1/inbound/email")
        .set("Content-Type", "text/plain")
        .set(INBOUND_SIGNATURE_HEADER, signInboundRequest(SECRET, "hello"))
        .send("hello");
      expect(form.status).toBe(415);

      const huge = await deliver(mail({ text: "x".repeat(150_000) }));
      expect(huge.status).toBe(413);
      expect(errorCode(huge.body)).toBe("payload_too_large");

      const malformed = await deliver(null, { raw: '{"messageId": ' });
      expect(malformed.status).toBe(400);
      expect(errorCode(malformed.body)).toBe("bad_request");
      expect(JSON.stringify(malformed.body)).not.toMatch(/at JSON\.parse|node_modules/);
    });

    it("validates a correctly signed body field by field", async () => {
      const res = await deliver({ ...mail(), messageId: "no-brackets", tenantId: "6741a0000000000000000002" });
      expect(res.status).toBe(400);
      const paths = ErrorEnvelopeSchema.parse(res.body).error.details?.map((d) => d.path);
      expect(paths).toEqual(expect.arrayContaining(["messageId"]));
      expect(res.body.error.details.some((d: { message: string }) => /tenantId/.test(d.message))).toBe(true);
    });

    it("answers 422 for recipients that are not a known workspace", async () => {
      for (const to of [`nobody-here@${DOMAIN}`, "acme-cloud@example.com"]) {
        const res = await deliver(mail({ to }));
        expect(res.status).toBe(422);
        expect(errorCode(res.body)).toBe("unknown_recipient");
      }
    });
  });

  describe("ingestion", () => {
    it("creates customer, ticket #1, message, events and outbox entries in one go", async () => {
      const result = await ingest(mail({ html: "<p>Hi<script>alert(1)</script></p>", text: undefined }));
      expect(result).toMatchObject({ status: "created", ticketNumber: 1, thread: "new_ticket" });

      const ticket = await ticketDoc(result.ticketId);
      expect(ticket).toMatchObject({ number: 1, status: "new", priority: "normal", version: 1, messageCount: 1, assigneeId: null });
      expect(ticket?.replyToken).toMatch(/^[a-z2-7]{26}$/);
      expect(await count(Collections.customers, { emailNormalized: "dana.pike@northwind.example" })).toBe(1);

      const message = await db.collection(Collections.messages).findOne({ _id: new ObjectId(result.messageId) });
      expect(message).toMatchObject({ kind: "public", direction: "inbound", authorType: "customer", bodyText: "Hi", bodyHtml: "<p>Hi</p>" });

      const events = await db.collection(Collections.ticketEvents).find({ ticketId: ticket?._id }).toArray();
      expect(events.map((e) => e.type).sort()).toEqual(["message.received", "ticket.created"]);
      const outbox = await db.collection(Collections.outboxEvents).find({ aggregateId: ticket?._id }).toArray();
      expect(outbox.map((e) => e.type).sort()).toEqual(["message.created", "ticket.created"]);
      expect(outbox.every((e) => e.publishedAt === null)).toBe(true);
    });

    it("stores exactly one message when the same delivery arrives three times", async () => {
      const payload = mail();
      const first = await ingest(payload, 201);
      const second = await ingest(payload, 200);
      // A provider retry re-signs with a new timestamp and may reorder JSON keys.
      const reordered = Object.fromEntries(Object.entries(payload).reverse());
      const third = await ingest(reordered as InboundEmailInput, 200);

      expect(second).toEqual({ ...first, status: "duplicate" });
      expect(third).toEqual({ ...first, status: "duplicate" });
      expect(await count(Collections.messages)).toBe(1);
      expect(await count(Collections.tickets)).toBe(1);
      expect((await ticketDoc(first.ticketId))?.version).toBe(1);
    });

    it("stores exactly one message for concurrent duplicate deliveries", async () => {
      const payload = mail();
      const results = await Promise.all(Array.from({ length: 6 }, () => deliver(payload)));
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([200, 200, 200, 200, 200, 201]);
      expect(new Set(results.map((r) => r.body.messageId)).size).toBe(1);
      expect(await count(Collections.messages)).toBe(1);
      expect(await count(Collections.ticketEvents)).toBe(2);
    });

    it("answers 409 when a Message-ID is reused with different content", async () => {
      const payload = mail();
      await ingest(payload);
      const res = await deliver({ ...payload, text: "Something else entirely" });
      expect(res.status).toBe(409);
      expect(errorCode(res.body)).toBe("idempotency_key_reused");
      expect(await count(Collections.messages)).toBe(1);
    });

    it("numbers tickets per workspace without gaps, also under concurrency", async () => {
      const acme = await Promise.all(Array.from({ length: 5 }, () => deliver(mail())));
      const globex = await ingest(mail({ to: GLOBEX }));
      expect(acme.map((r) => r.body.ticketNumber).sort()).toEqual([1, 2, 3, 4, 5]);
      expect(globex.ticketNumber).toBe(1);
    });

    it("keeps the same customer email separate per workspace", async () => {
      await ingest(mail());
      await ingest(mail({ to: GLOBEX }));
      expect(await count(Collections.customers, { emailNormalized: "dana.pike@northwind.example" })).toBe(2);
    });

    it("does not let a future sender date pin the ticket to the top", async () => {
      const before = Date.now();
      const result = await ingest(mail({ sentAt: "2099-01-01T00:00:00Z" }));
      const ticket = await ticketDoc(result.ticketId);
      expect(ticket?.lastActivityAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(ticket?.lastActivityAt.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("threading", () => {
    it("threads a reply by In-Reply-To and bumps version and count", async () => {
      const original = mail();
      const first = await ingest(original);
      const reply = await ingest(mail({ subject: "Re: Invoice question", inReplyTo: original.messageId }));
      expect(reply).toMatchObject({ ticketId: first.ticketId, thread: "headers" });
      expect(await ticketDoc(first.ticketId)).toMatchObject({ version: 2, messageCount: 2, subject: "Invoice question" });
    });

    it("threads by References when In-Reply-To is unknown", async () => {
      const original = mail();
      const first = await ingest(original);
      const reply = await ingest(mail({ inReplyTo: "<lost@mail.example>", references: [original.messageId] }));
      expect(reply.ticketId).toBe(first.ticketId);
    });

    it("threads by the reply token in the recipient address, whoever sends it", async () => {
      const first = await ingest(mail());
      const ticket = await ticketDoc(first.ticketId);
      const reply = await ingest(
        mail({ from: { email: "finance@northwind.example" }, to: `acme-cloud+${ticket?.replyToken}@${DOMAIN}` }),
      );
      expect(reply).toMatchObject({ ticketId: first.ticketId, thread: "reply_token" });
    });

    it("never threads by a reply token from another workspace", async () => {
      const acme = await ingest(mail());
      const token = (await ticketDoc(acme.ticketId))?.replyToken;
      const res = await ingest(mail({ to: `globex-hosting+${token}@${DOMAIN}` }));
      expect(res.thread).toBe("new_ticket");
      expect(res.ticketId).not.toBe(acme.ticketId);
    });

    it("does not thread by headers into another customer's ticket", async () => {
      const original = mail();
      const first = await ingest(original);
      const intruder = await ingest(mail({ from: { email: "mallory@evil.example" }, inReplyTo: original.messageId }));
      expect(intruder.ticketId).not.toBe(first.ticketId);
      expect(intruder.thread).toBe("new_ticket");
    });

    it("threads out-of-order arrivals: a reply before the message it answers", async () => {
      const original = mail({ sentAt: "2026-11-20T08:00:00Z" });
      const reply = mail({ sentAt: "2026-11-20T08:30:00Z", inReplyTo: original.messageId, references: [original.messageId] });
      const replyFirst = await ingest(reply);
      const late = await ingest(original);
      expect(late).toMatchObject({ ticketId: replyFirst.ticketId, thread: "headers" });

      const agent = await signIn(staff("ana"));
      const res = await agent.get(`/api/v1/tickets/${replyFirst.ticketId}/messages`).expect(200);
      const messages = MessageListResponseSchema.parse(res.body).messages;
      // Shown in the order they were written, not the order they arrived.
      expect(messages.map((m) => m.occurredAt)).toEqual(["2026-11-20T08:00:00.000Z", "2026-11-20T08:30:00.000Z"]);
    });

    it("reopens waiting and solved tickets but leaves on_hold alone", async () => {
      const cases = [
        ["pending_customer", "open"],
        ["solved", "open"],
        ["on_hold", "on_hold"],
        ["open", "open"],
      ] as const;
      for (const [from, to] of cases) {
        const original = mail();
        const first = await ingest(original);
        await db.collection(Collections.tickets).updateOne({ _id: new ObjectId(first.ticketId) }, { $set: { status: from } });
        await ingest(mail({ inReplyTo: original.messageId }));
        expect((await ticketDoc(first.ticketId))?.status).toBe(to);
        const changes = await db
          .collection(Collections.ticketEvents)
          .find({ ticketId: new ObjectId(first.ticketId), type: "ticket.status_changed" })
          .toArray();
        expect(changes.map((e) => e.payload)).toEqual(
          from === to ? [] : [expect.objectContaining({ from, to })],
        );
      }
    });

    it("starts a follow-up ticket when the customer writes to a closed one", async () => {
      const original = mail();
      const first = await ingest(original);
      await db.collection(Collections.tickets).updateOne({ _id: new ObjectId(first.ticketId) }, { $set: { status: "closed" } });
      const followUp = await ingest(mail({ inReplyTo: original.messageId }));
      expect(followUp).toMatchObject({ thread: "follow_up", ticketNumber: 2 });
      expect((await ticketDoc(followUp.ticketId))?.followUpOfTicketId?.toHexString()).toBe(first.ticketId);
      expect(await ticketDoc(first.ticketId)).toMatchObject({ status: "closed", version: 1, messageCount: 1 });
    });
  });

  describe("queue and detail", () => {
    async function seedQueue(): Promise<InboundEmailResult[]> {
      const results: InboundEmailResult[] = [];
      for (let i = 0; i < 7; i++) {
        // Four tickets share one timestamp so paging has to rely on the _id tie-breaker.
        const sentAt = i < 4 ? "2026-11-21T10:00:00Z" : `2026-11-21T1${i}:00:00Z`;
        results.push(await ingest(mail({ from: { email: `customer${i}@northwind.example` }, sentAt })));
      }
      await ingest(mail({ to: GLOBEX, subject: "Globex only" }));
      return results;
    }

    async function readAll(agent: TestAgent, view: TicketView, limit: number) {
      const pages: string[][] = [];
      let cursor: string | null = null;
      do {
        const res: request.Response = await agent
          .get("/api/v1/tickets")
          .query({ view, limit, ...(cursor ? { cursor } : {}) })
          .expect(200);
        const body = TicketListResponseSchema.parse(res.body);
        pages.push(body.tickets.map((t) => t.id));
        cursor = body.nextCursor;
      } while (cursor && pages.length < 20);
      return pages;
    }

    it("pages through a view newest-first without gaps or repeats", async () => {
      const created = await seedQueue();
      const agent = await signIn(staff("ana"), "acme-cloud");
      const pages = await readAll(agent, "active", 3);
      expect(pages.map((p) => p.length)).toEqual([3, 3, 1]);
      const ids = pages.flat();
      expect(new Set(ids).size).toBe(7);
      expect(ids.slice(0, 3)).toEqual([created[6]!.ticketId, created[5]!.ticketId, created[4]!.ticketId]);
      expect(ids.sort()).toEqual(created.map((c) => c.ticketId).sort());
    });

    it("lists only the caller's workspace", async () => {
      await seedQueue();
      const globex = await signIn(staff("tomas"));
      const res = await globex.get("/api/v1/tickets").query({ view: "all" }).expect(200);
      const body = TicketListResponseSchema.parse(res.body);
      expect(body.tickets.map((t) => t.subject)).toEqual(["Globex only"]);
      expect(body.tickets[0]?.customer.email).toBe("dana.pike@northwind.example");
    });

    it("filters by view", async () => {
      const created = await seedQueue();
      const marta = await signIn(staff("marta"));
      const me = await db.collection("users").findOne({ emailNormalized: staff("marta") });
      await db.collection(Collections.tickets).updateOne({ _id: new ObjectId(created[0]!.ticketId) }, { $set: { assigneeId: me?._id } });
      await db.collection(Collections.tickets).updateOne({ _id: new ObjectId(created[1]!.ticketId) }, { $set: { status: "solved" } });
      await db.collection(Collections.tickets).updateOne({ _id: new ObjectId(created[2]!.ticketId) }, { $set: { status: "pending_customer" } });

      const ids = async (view: TicketView) =>
        TicketListResponseSchema.parse((await marta.get("/api/v1/tickets").query({ view }).expect(200)).body).tickets.map((t) => t.id);
      expect(await ids("mine")).toEqual([created[0]!.ticketId]);
      expect(await ids("done")).toEqual([created[1]!.ticketId]);
      expect(await ids("waiting")).toEqual([created[2]!.ticketId]);
      expect(await ids("unassigned")).not.toContain(created[0]!.ticketId);
      expect(await ids("active")).toHaveLength(5);
      expect(await ids("all")).toHaveLength(7);
    });

    it("rejects cursors from another view, bad limits and injected operators", async () => {
      await seedQueue();
      const agent = await signIn(staff("ana"), "acme-cloud");
      const first = TicketListResponseSchema.parse((await agent.get("/api/v1/tickets?limit=2").expect(200)).body);
      const wrongView = await agent.get("/api/v1/tickets").query({ view: "all", cursor: first.nextCursor });
      expect(wrongView.status).toBe(400);
      expect(errorCode(wrongView.body)).toBe("invalid_cursor");
      expect((await agent.get("/api/v1/tickets?limit=500")).status).toBe(400);
      expect((await agent.get("/api/v1/tickets?view[$ne]=x")).status).toBe(400);
      expect((await agent.get("/api/v1/tickets?view=all&view=done")).status).toBe(400);
    });

    it("needs a session", async () => {
      expect((await http().get("/api/v1/tickets")).status).toBe(401);
    });

    it("serves the detail with an ETag that changes when a message arrives", async () => {
      const original = mail();
      const created = await ingest(original);
      const agent = await signIn(staff("pedro"));

      const res = await agent.get(`/api/v1/tickets/${created.ticketId}`).expect(200);
      const detail = TicketDetailSchema.parse(res.body);
      expect(detail).toMatchObject({ number: 1, version: 1, followUpOfTicketId: null, customer: { displayName: "Dana Pike" } });
      expect(JSON.stringify(res.body)).not.toContain("replyToken");
      const etag = res.headers.etag as string;
      expect(etag).toBe(`"${created.ticketId}.1"`);
      expect(res.headers["cache-control"]).toBe("private, no-cache");

      const notModified = await agent.get(`/api/v1/tickets/${created.ticketId}`).set("If-None-Match", etag);
      expect(notModified.status).toBe(304);

      await ingest(mail({ inReplyTo: original.messageId }));
      const changed = await agent.get(`/api/v1/tickets/${created.ticketId}`).set("If-None-Match", etag).expect(200);
      expect(changed.headers.etag).toBe(`"${created.ticketId}.2"`);
      expect(TicketDetailSchema.parse(changed.body).messageCount).toBe(2);
    });

    it("answers 404 for tickets in another workspace and for malformed ids", async () => {
      const globexTicket = await ingest(mail({ to: GLOBEX }));
      const agent = await signIn(staff("pedro"));
      for (const path of [
        `/api/v1/tickets/${globexTicket.ticketId}`,
        `/api/v1/tickets/${globexTicket.ticketId}/messages`,
        "/api/v1/tickets/not-an-id",
        `/api/v1/tickets/${new ObjectId().toHexString()}`,
      ]) {
        const res = await agent.get(path);
        expect(res.status).toBe(404);
        expect(errorCode(res.body)).toBe("not_found");
      }
    });

    it("pages through a conversation oldest-first and exposes no threading data", async () => {
      const original = mail({ sentAt: "2026-11-22T09:00:00Z" });
      const created = await ingest(original);
      for (let i = 1; i <= 4; i++) {
        await ingest(mail({ inReplyTo: original.messageId, sentAt: `2026-11-22T09:0${i}:00Z`, text: `reply ${i}` }));
      }
      const agent = await signIn(staff("ana"), "acme-cloud");
      const first = MessageListResponseSchema.parse(
        (await agent.get(`/api/v1/tickets/${created.ticketId}/messages?limit=3`).expect(200)).body,
      );
      const second = MessageListResponseSchema.parse(
        (await agent.get(`/api/v1/tickets/${created.ticketId}/messages`).query({ limit: 3, cursor: first.nextCursor }).expect(200)).body,
      );
      expect([...first.messages, ...second.messages].map((m) => m.bodyText)).toEqual([
        "Where can I download last month's invoice?",
        "reply 1",
        "reply 2",
        "reply 3",
        "reply 4",
      ]);
      expect(second.nextCursor).toBeNull();
      const raw = JSON.stringify(first);
      expect(raw).not.toContain("externalMessageId");
      expect(raw).not.toContain("threadRefs");

      // A message cursor only works for the ticket it came from.
      const other = await ingest(mail());
      const misuse = await agent.get(`/api/v1/tickets/${other.ticketId}/messages`).query({ cursor: first.nextCursor });
      expect(misuse.status).toBe(400);
    });
  });
});

describe("inbound webhook without a secret", () => {
  it("is disabled with 503", async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      MONGODB_URI: "mongodb://127.0.0.1:1/unused?serverSelectionTimeoutMS=100",
      REDIS_URL: "redis://localhost:6379",
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(config)
      .compile();
    const app = configureApp(moduleRef.createNestApplication({ rawBody: true }), config);
    await app.init();
    try {
      const res = await request(app.getHttpServer())
        .post("/api/v1/inbound/email")
        .set("Content-Type", "application/json")
        .send("{}");
      expect(res.status).toBe(503);
      expect(ErrorEnvelopeSchema.parse(res.body).error.code).toBe("inbound_disabled");
    } finally {
      await app.close();
    }
  });
});
