# Identity and tenancy threat model

Scope: sign-in, sessions, workspace (tenant) selection and role checks, as built in week 2. Tickets, webhooks, AI features and the customer portal get their own sections when they land. How the pieces work is described in [Authentication and tenancy](../auth-and-tenancy.md); this page is about what can go wrong.

## What we protect

| Asset | Why it matters |
|---|---|
| Tenant data (tickets, customers, notes from week 3) | One support team must never see another company's customers |
| Staff accounts and their passwords | A taken-over admin can read and change everything in a workspace |
| Session tokens | A stolen token is a signed-in user until it expires |
| Role assignments | An agent who becomes admin can manage members and SLA policies |
| Personal data in logs | Logs are copied to places with weaker access control than the database |

## Who we defend against

- **Outsider on the internet**: no account; guesses passwords, replays links, tries a malicious site that posts to HelpHarbor.
- **Signed-in user of tenant A** who tries to reach tenant B's data by changing ids, slugs, headers or request bodies.
- **Lower-privileged member** (agent) who tries admin or lead actions the navigation hides.
- **Former member** whose membership was removed or role lowered while a session is still open.
- **Someone reading logs** (support engineer, log vendor) who should not learn who signed in from where.

Out of scope for now: a compromised API host or database, a malicious HelpHarbor operator, and the browser of a signed-in user being compromised (malware, extensions).

## Trust boundaries

```text
browser ──(web origin, cookie)──▶ Next.js server ──(/api/* rewrite, cookie forwarded)──▶ NestJS API ──▶ MongoDB
```

- The browser only talks to the web origin; it never sees the API host or the database.
- The API trusts nothing from the request for tenancy: the tenant comes from the session's active workspace, re-checked against `memberships` on every request.
- MongoDB validators are a second net, not the first check.

## Threats and mitigations

| # | Threat | Mitigation | Covered by |
|---|---|---|---|
| T1 | Read another tenant's document by id | `TenantScopedCollection` requires a concrete `tenantId` in every filter; the tenant comes from `CurrentTenant`; a foreign id answers `404`, same as a missing one | `tenant-isolation.e2e.spec.ts` (read, list, update, delete), `tenant-scoped-collection.spec.ts` |
| T2 | Smuggle a tenant id in the body, query or a header | Tenant never read from the request; inserts and updates can't set `tenantId` | `tenant-isolation.e2e.spec.ts` "ignores a tenant id sent in the body, query or headers" |
| T3 | Switch into a workspace without membership | `switch-tenant` only accepts the user's own memberships; others answer `404` | API + Playwright `forbidden-access.spec.ts` |
| T4 | Agent calls admin/lead endpoints directly | `RolesGuard` checks `ROLE_PERMISSIONS` on every route; navigation hiding is cosmetic | Role matrix test for every seeded membership × permission × GET/POST; Playwright members page + API `403` |
| T5 | Removed member or lowered role keeps access | Membership and role re-read on every request; a stale active workspace answers `403 no_workspace` | "applies a role change on the next request", "refuses a session whose active workspace was tampered with" |
| T6 | Cross-site request forgery | `SameSite=Lax` cookie, `Origin` must equal `WEB_ORIGIN` (login included), per-session `x-csrf-token` on every state-changing request | `auth.e2e.spec.ts`, Playwright "refuses a state-changing request without the CSRF token" and "refuses sign-in posted from another origin" |
| T7 | Session theft through page scripts (XSS) | `HttpOnly` cookie; only a SHA-256 of the token is stored, so a database read does not yield usable tokens | Playwright "keeps the session cookie out of reach of page scripts" |
| T8 | Session fixation | Sign-in always creates a new token and deletes the session the browser had | `auth.e2e.spec.ts` |
| T9 | Long-lived stolen sessions | Idle (`SESSION_IDLE_MINUTES`) and absolute (`SESSION_ABSOLUTE_HOURS`) expiry; TTL index removes old sessions; sign-out deletes the session server-side | `auth.e2e.spec.ts`, Playwright "signing out ends the session on the server" |
| T10 | Account enumeration | Unknown email, wrong password and disabled account give the same `401 invalid_credentials`; unknown emails still run an argon2 verify | `auth.e2e.spec.ts`, Playwright "gives the same answer for a wrong password and an unknown email" |
| T11 | Offline password cracking after a database leak | argon2id (19 MiB, 2 iterations); the seed refuses empty, short or placeholder demo passwords | `password.service.spec.ts`, `demo-identities.spec.ts` |
| T12 | NoSQL operator injection (`{"$ne": null}`) | Strict Zod schemas on every body; ids parsed with `ObjectId.isValid` before use | `auth.e2e.spec.ts`, "rejects malformed ids as not found" |
| T13 | Open redirect after sign-in | `returnTo` limited to same-site paths (no scheme, `//`, backslash or `/login`) | `return-to.test.ts`, Playwright "never follows an off-site returnTo" |
| T14 | Personal data in logs | Failed sign-ins log a masked email (`m***@acme-cloud.example`); 5xx stack traces pass through `redactEmails`; passwords and tokens are never logged | `masking.test.ts` |

## Known gaps

- **No login throttling or lockout yet** (planned for week 11). Until then, argon2's cost and the masked failure log are the only brakes on password guessing; put a rate-limiting proxy in front of any public deployment.
- No multi-factor authentication and no OIDC provider.
- Member management is read-only, so there is no invitation flow to attack yet, and also no way to remove a member except in the database.
- Sessions are not bound to an IP address or device.
- Redis is configured but not used, so there is no shared rate-limit state.

## Demo accounts

`pnpm seed` creates two fictional workspaces and seven staff accounts; the table is in [Local setup → Seed data](../setup.md#seed-data).

- Every account uses the reserved `.example` domain and invented names; no real person or company is involved, and no real data may be loaded into a demo database.
- All demo accounts share one password, `SEED_DEMO_PASSWORD`, which is never committed. The seed refuses an empty, short (under 12 characters) or placeholder value.
- Ana (`ana.agent@acme-cloud.example`) is an agent in both workspaces, so the workspace switcher and cross-tenant cases can be tried by hand.
- CI uses its own throwaway password, set in the workflow, on a database that is deleted after the run.
- Never run the seed against a shared or production database: it resets the demo users' passwords and re-enables them.

## Masking personal data

`@helpharbor/contracts` exports three helpers for anything that leaves the database for humans to read:

| Helper | Example |
|---|---|
| `maskEmail` | `marta.admin@acme-cloud.example` → `m***@acme-cloud.example` |
| `maskName` | `Marta Ruiz` → `M. R.` |
| `redactEmails` | masks every address inside free text, such as an error message or stack trace |

They are lossy on purpose: enough to tell accounts apart while debugging, not enough to look anyone up. Use them in logs, error reports and any sample output pasted into docs or issues.
