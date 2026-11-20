# ADR 0001: Next.js for the UI, NestJS for the API

- **Status:** accepted
- **Date:** 2026-11-20

## Context

HelpHarbor needs an agent console, an admin area and a customer portal, plus a REST API, a WebSocket gateway, an inbound webhook and background jobs. Tenant isolation is the most important security property: an agent from one tenant must never see another tenant's data.

Next.js can talk to a database directly from Server Components and Route Handlers. If both Next.js and a separate API wrote to MongoDB, authorization and tenant scoping would live in two places and drift apart.

## Decision

- **Next.js (App Router)** renders the UI only. Server Components fetch from the NestJS API and forward the user's session cookie. Next.js never connects to MongoDB or Redis.
- **NestJS** owns authentication, tenancy, validation and every write. It serves `/api/v1/*` and the Socket.IO gateway. Tenant scoping is enforced by guards and by a repository layer that rejects filters without `tenantId`.
- **Workers** are a separate NestJS application sharing domain modules with the API; ingestion, SLA breach checks, embeddings and model calls run there, never inside an HTTP request.
- **Shared code** lives in workspace packages: `contracts` (Zod schemas) and `sla-engine` (pure TypeScript, no I/O).
- The repository is a **pnpm workspace with Turborepo** for task orchestration and caching.

## Consequences

- Authorization has one home, so it can be tested once at the API boundary.
- Every page needs an API endpoint; there are no "quick" database reads from the UI.
- Two Node processes run in development (`apps/web`, `apps/api`), started together by `pnpm dev`.
- Validation is shared through `contracts`, so the web and the API reject the same invalid input.
- The API and workers can be deployed and scaled separately from the web app.

## Alternatives considered

- **Next.js only (Route Handlers + server actions):** fewer moving parts, but no natural home for long-lived WebSocket connections and BullMQ workers, and authorization would be spread across many handlers.
- **Separate repositories per service:** clearer ownership for large teams, but shared contracts would need publishing and versioning; too much overhead for one team.
