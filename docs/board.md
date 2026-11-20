# 12-week board

Status: `todo` · `doing` · `done`. Updated at the end of each week together with the risks for the next one.

| Week | Theme | Outcome | Status |
|---|---|---|---|
| 01 | Product definition & workspace bootstrap | Monorepo runs Next.js, NestJS, a MongoDB replica set and Redis locally; CI green | done |
| 02 | Tenancy, authentication & roles | Two synthetic tenants with server-enforced isolation and role tests | todo |
| 03 | Tickets, messages & inbound ingestion | Signed, idempotent webhook creates threaded tickets exactly once | todo |
| 04 | Replies, audit trail & SLA engine start | Replies and notes with `If-Match`; status machine; pure SLA engine with golden fixtures | todo |
| 05 | SLA policies, macros & breach checks | Calendar editor, policy snapshots, breach events emitted exactly once | todo |
| 06 | Realtime presence & collision detection | Socket.IO rooms, Redis presence, "replying" banner, outbox relay | todo |
| 07 | Knowledge base & suggested triage | Versioned articles; rule-first triage with a mock provider, agent confirms | todo |
| 08 | Jobs, observability & staging | Retries and dead-letter queue, structured logs, staging environment | todo |
| 09 | Cited reply drafts | Hybrid retrieval with tenant filter, citation validator, draft panel | todo |
| 10 | Reports & KB gaps | SLA aggregations, daily rollups, KB gap report, safe CSV export | todo |
| 11 | Security hardening | Tenant/role audit, rate limits, abuse suite, backup restore | todo |
| 12 | Release | Release candidate, public demo with monitoring, case study | todo |

## Week 01 checklist

- [x] Product charter, personas, SLA glossary
- [x] ADR 0001: Next.js + NestJS split
- [x] pnpm + Turborepo workspace and Next.js App Router shell with agent console placeholder
- [x] NestJS API with versioned health endpoint and config validation
- [x] MongoDB single-node replica set and Redis in Compose
- [x] Shared `contracts` package with Zod schemas
- [x] Local startup documentation (`scripts/dev.sh`, `docs/setup.md`)
- [x] CI: lint, typecheck, test and build, plus a Compose transaction check

## Risks

- No lockfile is committed yet; the first install generates `pnpm-lock.yaml`, which should be committed so CI switches to `--frozen-lockfile`.
- The toolchain (Node, pnpm, Docker) must be available to verify the workspace end to end.
- MongoDB Search and Vector Search on a laptop depend on the `mongodb/mongodb-atlas-local` image; confirm its current status when the Compose stack is added.
