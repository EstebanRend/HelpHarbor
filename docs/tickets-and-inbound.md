# Tickets and inbound email

How a simulated email becomes a ticket, and how agents read the queue. No real mailbox is connected: a "mail provider" is anything that can sign and POST JSON to the webhook (tests, scripts, curl).

## Data model

| Collection | Key fields | Rules |
|---|---|---|
| `customers` | `tenantId`, `emailNormalized`, `displayName` | Unique `(tenantId, emailNormalized)`; created on first contact |
| `counters` | `tenantId`, `name: "ticket"`, `seq` | Unique `(tenantId, name)`; incremented inside the ingestion transaction, so numbers start at 1 per workspace and have no gaps |
| `tickets` | `tenantId`, `number`, `status`, `priority`, `customerId`, `assigneeId`, `replyToken`, `version`, `lastActivityAt` | Unique `(tenantId, number)` and `(tenantId, replyToken)`; `version` goes up on every change |
| `messages` | `tenantId`, `ticketId`, `kind`, `authorType`, `bodyText`, `bodyHtml`, `externalMessageId`, `threadRefs`, `occurredAt` | Unique `(tenantId, externalMessageId)` for inbound mail (partial index); never updated after insert |
| `ticket_events` | `tenantId`, `ticketId`, `type`, `actor`, `at`, `payload` | Append-only: `ticket.created`, `message.received`, `ticket.status_changed` |
| `outbox_events` | `tenantId`, `type`, `aggregateId`, `payload`, `publishedAt` | Written in the same transaction; a relay will publish them to Socket.IO once it exists (`publishedAt` stays null until then) |

Every collection is accessed through `TenantScopedCollection`, so a query without a concrete `tenantId` throws before it reaches MongoDB. `tenantId` leads every compound index.

## Webhook

`POST /api/v1/inbound/email`, `Content-Type: application/json`, at most 100 kB.

```json
{
  "messageId": "<a1.b2@mail.northwind.example>",
  "inReplyTo": "<earlier@mail.northwind.example>",
  "references": ["<earlier@mail.northwind.example>"],
  "from": { "email": "dana.pike@northwind.example", "name": "Dana Pike" },
  "to": "acme-cloud@inbound.helpharbor.example",
  "subject": "Invoice question",
  "text": "Where can I download last month's invoice?",
  "html": "<p>Where can I download last month's invoice?</p>",
  "sentAt": "2026-11-20T09:15:00+01:00"
}
```

`inReplyTo`, `references`, `html` and `from.name` are optional; one of `text` or `html` is required. Unknown fields are rejected, including any attempt to pass a tenant id: the workspace comes only from the recipient address.

### Signature

```
x-helpharbor-signature: t=<unix seconds>,v1=<hex HMAC-SHA256(INBOUND_WEBHOOK_SECRET, "<t>.<raw body>")>
```

- The HMAC covers the timestamp and the exact bytes sent, so re-serializing the JSON breaks it.
- Requests more than `INBOUND_SIGNATURE_TOLERANCE_SECONDS` (default 300) from the server clock are refused, which limits replays of a captured request.
- Several `v1=` values may be sent while rotating secrets; one match is enough.
- The signature is checked before the body is validated. Missing, malformed, expired and wrong signatures all answer the same `401 invalid_signature`; only the server log says which.
- Without `INBOUND_WEBHOOK_SECRET` the endpoint answers `503 inbound_disabled`.

`apps/api/src/inbound/signature.ts` has `signInboundRequest(secret, rawBody)` for senders.

### Responses

| Status | Body / code | When |
|---|---|---|
| 201 | `{ status: "created", ticketId, ticketNumber, messageId, thread }` | First delivery of a Message-ID |
| 200 | same, `status: "duplicate"` | Redelivery of the same email (same content, any key order or signing time) |
| 400 | `validation_failed` / `bad_request` | Body does not match the contract / is not valid JSON |
| 401 | `invalid_signature` | See above |
| 409 | `idempotency_key_reused` | Same Message-ID, different content |
| 413 | `payload_too_large` | Body over 100 kB |
| 415 | `unsupported_media_type` | Not `application/json` |
| 422 | `unknown_recipient` | Recipient is not `<workspace slug>[+token]@INBOUND_EMAIL_DOMAIN`, or the workspace does not exist |
| 503 | `inbound_disabled` | No secret configured |

## Ingestion

One multi-document transaction (`InboundService`), retried by the driver on transient write conflicts:

1. **Dedupe** on `(tenantId, messageId)`. A match with the same content fingerprint (SHA-256 of the key-sorted payload) returns the original result; a different fingerprint is a `409`. Two deliveries racing each other conflict inside the transaction; the loser is retried and takes the duplicate path, so exactly one message is stored.
2. **Customer** upserted by normalized sender email, per workspace.
3. **Thread**, first match wins:
   1. *Reply token*: the recipient is `<slug>+<token>@…` and the token belongs to a ticket of this workspace. Tokens are 128 random bits, so the sender may differ (a colleague replying from another address).
   2. *Headers*: a stored message whose Message-ID is in this email's `In-Reply-To`/`References`, **or** a stored message that lists this email's Message-ID in its own references. The second direction threads a reply that arrived before the message it answers. Header matches only join tickets of the same customer, so a guessed Message-ID cannot inject a message into someone else's conversation.
   3. Otherwise a new ticket.
4. **Ticket**: a new ticket gets the next number, status `new`, priority `normal`, a fresh reply token and `version: 1`. An existing ticket gets `version + 1`, `messageCount + 1` and a later `lastActivityAt`; `pending_customer` and `solved` go back to `open` (with a `ticket.status_changed` event), `on_hold` stays because an agent chose it. A reply to a **closed** ticket starts a follow-up ticket with `followUpOfTicketId` set (`thread: "follow_up"`); closed tickets are never modified.
5. **Message**: plain text always; HTML only after sanitizing (allowlisted formatting tags, links limited to http/https/mailto with `rel="noopener noreferrer nofollow"`, no images, scripts, styles, forms or event handlers). Mail without a text part gets text derived from the HTML.
6. **Events and outbox** for the ticket and the message.

`occurredAt` is the sender's `sentAt`, capped at the time of arrival so a future date cannot pin a ticket to the top of the queue. Conversations are ordered by `occurredAt`, so out-of-order deliveries still read in the order they were written.

## Agent API

All routes need a session and `tickets:read` (every role has it). The workspace is the session's active one; a ticket id from another workspace, an unknown id and a malformed id all answer `404 not_found`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/v1/tickets?view=&cursor=&limit=` | Views `active` (default: new + open), `mine`, `unassigned`, `waiting` (pending_customer + on_hold), `done` (solved + closed), `all`. Newest `lastActivityAt` first, `_id` as tie-breaker. `limit` 1–100, default 25 |
| `GET` | `/api/v1/tickets/{id}` | Ticket with customer; `ETag: "<id>.<version>"`, `Cache-Control: private, no-cache`; `If-None-Match` with the current tag answers `304` |
| `GET` | `/api/v1/tickets/{id}/messages?cursor=&limit=` | Oldest first; `limit` 1–200, default 50. Threading data (Message-IDs, reply token) is never returned |

Cursors are opaque keyset positions (sort value + `_id`) bound to the list they came from: a queue cursor used with another view, or a message cursor used on another ticket, answers `400 invalid_cursor`. Query parameters are validated strictly, so `?view[$ne]=x` or a repeated parameter is a `400`.

Because the queue is sorted by activity, a ticket that receives a message while someone is paging can move to an earlier page. Realtime updates, planned for a later week, will tell the console to refetch.
