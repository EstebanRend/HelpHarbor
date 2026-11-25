# Authentication and tenancy

How a request becomes "Ana, agent in Acme Cloud", and what stops it from reaching another tenant's data.

## Data model

| Collection | Key fields | Rules |
|---|---|---|
| `tenants` | `slug`, `name`, `timezone` | Unique `slug` |
| `users` | `emailNormalized`, `displayName`, `passwordHash`, `disabledAt` | Unique email; hash must be argon2id |
| `memberships` | `tenantId`, `userId`, `role` | Unique `(tenantId, userId)`; role is `admin`, `lead` or `agent` |
| `sessions` | `tokenHash`, `userId`, `activeTenantId`, `csrfToken`, `expiresAt` | Unique `tokenHash`; TTL index on `expiresAt` |

Each collection has a `$jsonSchema` validator (`apps/api/src/database/schema.ts`), applied by the API at startup and by `pnpm seed`. The validators back up the Zod checks in the API; they are not the first line of defence.

## Sign-in

`POST /api/v1/auth/login` with `{ email, password, tenantSlug? }`:

1. The body is parsed with the shared `LoginRequestSchema` (strict object, so `{ "email": { "$ne": null } }` is a 400, never a query).
2. The password is checked with argon2id (19 MiB, 2 iterations). Unknown email, wrong password and disabled account all return `401 invalid_credentials`, and an unknown email still runs a hash check so timing does not reveal which emails exist.
3. A new session is created: a random 256-bit token goes into the cookie, only its SHA-256 is stored. Any session the browser already had is deleted.
4. The cookie `hh_session` is `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production.

Sessions end after `SESSION_IDLE_MINUTES` without a request or `SESSION_ABSOLUTE_HOURS` after sign-in, whichever comes first. An expired session answers `401 session_expired` and clears the cookie; no cookie at all is `401 unauthenticated`. The web app uses that difference to show "Your session has ended" on the sign-in page.

## Guards

Every route passes four global guards, in this order:

| Guard | Skipped by | Does |
|---|---|---|
| `SessionGuard` | `@Public()` | Resolves the cookie to a live session and an enabled user |
| `CsrfGuard` | safe methods (`GET`, `HEAD`, `OPTIONS`) | Rejects a foreign `Origin` (`403 origin_not_allowed`, also for login); with a session, requires `x-csrf-token` to match the session's token (`403 csrf_token_invalid`) |
| `TenantGuard` | `@Public()`, `@SkipTenant()` | Takes the tenant from the session's active workspace and re-reads the membership, so removed members and role changes apply on the next request (`403 no_workspace`) |
| `RolesGuard` | routes without `@RequirePermission()` | Checks the role against `ROLE_PERMISSIONS` from `@helpharbor/contracts` (`403 forbidden`) |

The tenant never comes from the URL or the request body. Switching workspace (`POST /api/v1/auth/switch-tenant`) only accepts tenants the user belongs to; any other slug answers `404`, the same as a workspace that does not exist.

## Tenant-scoped repositories

Tenant-owned collections are accessed through `TenantScopedCollection` (`apps/api/src/database/tenant-scoped-collection.ts`). It throws `MissingTenantScopeError` before calling the driver when:

- a filter has no `tenantId`, or `tenantId` is not a concrete `ObjectId` (`{ $ne: … }`, `{ $exists: true }`, a string, or a `tenantId` hidden inside `$or`);
- an insert has no `tenantId`;
- an update tries to `$set` or `$unset` `tenantId`;
- an aggregation does not start with a `$match` on `tenantId`.

The one deliberate exception is listing a user's own memberships at sign-in, which reads `memberships` by `userId` across tenants.

## Roles

The permission matrix lives in `packages/contracts/src/permissions.ts` and matches the table in [personas](product/personas.md). The API enforces it; the web app uses the same matrix only to decide which navigation entries to show.

## Web app

- The browser only talks to the web origin. Next.js proxies `/api/*` to the API, so the session cookie is first-party and no CORS request is needed.
- Server Components forward the browser's cookies to `GET /api/v1/auth/session` and redirect to `/login?returnTo=…` (or `…&expired=1`) when there is no live session.
- `returnTo` is limited to same-site paths, so a crafted link cannot redirect off-site after sign-in.
- Client actions (switch workspace, sign out) send the CSRF token from the session response; a `401` sends the user back to sign-in.

## Not done yet

- Login rate limiting and account lockout (week 11).
- Customer portal accounts (the `customer` column of the role matrix).
- Invitations and member management writes; members are read-only for now.
