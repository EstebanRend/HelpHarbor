import { describe, expect, it } from "vitest";
import {
  InboundEmailSchema,
  MessageListQuerySchema,
  TICKET_VIEW_STATUSES,
  TicketListQuerySchema,
  TicketStatusSchema,
  TicketViewSchema,
} from "./index";

const email = {
  messageId: "<a1.b2@mail.northwind.example>",
  from: { email: " Dana.Pike@Northwind.example ", name: "Dana Pike" },
  to: "Acme-Cloud@inbound.helpharbor.example",
  subject: "Invoice question",
  text: "Hi, where can I download last month's invoice?",
  sentAt: "2026-11-20T09:15:00+01:00",
};

describe("InboundEmailSchema", () => {
  it("normalizes addresses and defaults references and subject", () => {
    const { subject: _subject, ...withoutSubject } = email;
    const parsed = InboundEmailSchema.parse(withoutSubject);
    expect(parsed.from.email).toBe("dana.pike@northwind.example");
    expect(parsed.to).toBe("acme-cloud@inbound.helpharbor.example");
    expect(parsed.references).toEqual([]);
    expect(parsed.subject).toBe("");
  });

  it("needs a text or an html body", () => {
    const { text: _text, ...noBody } = email;
    const result = InboundEmailSchema.safeParse(noBody);
    expect(result.success).toBe(false);
    expect(InboundEmailSchema.safeParse({ ...noBody, html: "<p>Hi</p>" }).success).toBe(true);
  });

  it("rejects Message-IDs without angle brackets or with spaces", () => {
    expect(InboundEmailSchema.safeParse({ ...email, messageId: "a1@mail.example" }).success).toBe(false);
    expect(InboundEmailSchema.safeParse({ ...email, messageId: "<a 1@mail.example>" }).success).toBe(false);
    expect(InboundEmailSchema.safeParse({ ...email, inReplyTo: "nope" }).success).toBe(false);
  });

  it("rejects unknown fields such as a tenant id in the body", () => {
    expect(InboundEmailSchema.safeParse({ ...email, tenantId: "6741a0000000000000000001" }).success).toBe(false);
  });

  it("rejects timestamps without an offset and oversized reference lists", () => {
    expect(InboundEmailSchema.safeParse({ ...email, sentAt: "20 Nov 2026" }).success).toBe(false);
    const references = Array.from({ length: 101 }, (_, i) => `<r${i}@mail.example>`);
    expect(InboundEmailSchema.safeParse({ ...email, references }).success).toBe(false);
  });
});

describe("ticket queue queries", () => {
  it("defaults to the active view and 25 tickets", () => {
    expect(TicketListQuerySchema.parse({})).toEqual({ view: "active", limit: 25 });
  });

  it("coerces limit from the query string and enforces bounds", () => {
    expect(TicketListQuerySchema.parse({ limit: "100" }).limit).toBe(100);
    expect(TicketListQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(TicketListQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(MessageListQuerySchema.safeParse({ limit: "201" }).success).toBe(false);
  });

  it("rejects unknown views, extra parameters and cursors with odd characters", () => {
    expect(TicketListQuerySchema.safeParse({ view: "everything" }).success).toBe(false);
    expect(TicketListQuerySchema.safeParse({ tenantId: "x" }).success).toBe(false);
    expect(TicketListQuerySchema.safeParse({ cursor: "abc$ne" }).success).toBe(false);
  });

  it("maps every view to known statuses, and `all` to every status", () => {
    for (const view of TicketViewSchema.options) {
      expect(TICKET_VIEW_STATUSES[view].length).toBeGreaterThan(0);
      for (const status of TICKET_VIEW_STATUSES[view]) {
        expect(TicketStatusSchema.options).toContain(status);
      }
    }
    expect([...TICKET_VIEW_STATUSES.all]).toEqual(TicketStatusSchema.options);
  });
});
