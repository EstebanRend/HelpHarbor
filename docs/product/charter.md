# Product charter

## Problem

Small software companies answer support email from a shared inbox. Three failures repeat:

1. Two agents reply to the same customer because neither knows the other is writing.
2. Urgent tickets miss their response-time promise and nobody notices until the customer complains.
3. Answers drift away from the documented policy because agents write from memory.

## Product

HelpHarbor is a multi-tenant help desk. Every ticket carries a deterministic SLA clock, agents see live "viewing" and "replying" indicators, and suggested replies are built only from the tenant's own published knowledge-base articles, with citations a human reviews before anything is sent.

## Goals for v1

| Goal | How we will know |
|---|---|
| Tenants are isolated | Authorization tests show zero cross-tenant reads or writes for tickets, KB, reports and socket rooms |
| SLA times are trustworthy | Due times match golden fixtures across business hours, holidays and DST changes |
| Ingestion is safe to retry | Replaying the same inbound message yields exactly one ticket message |
| Humans stay in charge | Every sent message has a human sender; drafts and suggestions never change a ticket on their own |
| The queue stays fast | Queue list P95 under 300 ms on a stated local seeded load (a test target, not a production claim) |

## In scope (MVP, weeks 1–8)

- Workspaces, users, memberships and roles (admin, lead, agent) plus a customer portal
- Simulated, HMAC-signed inbound email webhook and a public web form
- Ticket queue, ticket detail, public replies, internal notes and an audited timeline
- Business calendars, SLA policies and a pure SLA engine with pause/resume
- Realtime presence and collision detection
- Knowledge base with draft → review → published versions
- Suggested triage behind an `AiProvider` interface with a mock provider
- Staging deployment

Weeks 9–12 add cited reply drafts with vector search, the KB gap report, reports, hardening and the public demo.

## Out of scope

- Real email providers, telephony, chatbots, payments and SSO
- Any automated action by a model: no sending, closing, refund promises or SLA policy changes
- Real customer data; every company, customer and ticket is synthetic

## Constraints

- One monorepo, one local start command (`docker compose up` plus `pnpm dev`).
- Next.js renders UI only; the NestJS API owns authentication, tenancy and every write (see [ADR 0001](../adr/0001-nextjs-nestjs-split.md)).
- MongoDB runs as a replica set from day one because transactions and change streams need it.
- CI must not need paid model tokens.

## Related documents

- [Personas](personas.md)
- [SLA glossary](../sla-policy/glossary.md)
- [12-week board](../board.md)
