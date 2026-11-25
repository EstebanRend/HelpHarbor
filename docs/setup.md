# Local setup

## Requirements

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22 or newer | `.nvmrc` pins 22 |
| pnpm | 10 (pinned in `package.json`) | `corepack enable` installs the pinned version |
| Docker | with the Compose plugin | runs MongoDB and Redis only; the apps run on the host |

## One-command startup

```bash
./scripts/dev.sh        # or: pnpm dev:local
```

The script:

1. checks Node.js and pnpm versions
2. copies `.env.example` to `.env` if `.env` does not exist
3. runs `pnpm install`
4. starts MongoDB (single-node replica set, `mongodb/mongodb-atlas-local`) and Redis with `docker compose up -d --wait`
5. runs `pnpm verify:mongo` until a multi-document transaction commits and rolls back, retrying while the replica set elects a primary
6. starts the API and the web app in watch mode with `pnpm dev`

Then open:

- agent console: <http://localhost:3000> (redirects to `/console`, or to `/login` when you are not signed in)
- API health: <http://localhost:4000/api/v1/health>

Before the first sign-in, set `SEED_DEMO_PASSWORD` in `.env` and run `pnpm seed` (see [Seed data](#seed-data)).

Other modes:

| Command | What it does |
|---|---|
| `./scripts/dev.sh infra` | Steps 1–5 only: containers up and verified, apps not started |
| `./scripts/dev.sh check` | Lint, typecheck, unit tests and build, the same steps as CI |
| `pnpm infra:down` | Stops the containers; data stays in named volumes |
| `docker compose down -v` | Stops the containers and deletes local data |

## Environment variables

All variables live in one `.env` file at the repository root. Never commit it; `.env.example` is the template.

| Variable | Used by | Default in `.env.example` | Purpose |
|---|---|---|---|
| `NODE_ENV` | API | `development` | `development`, `test` or `production` |
| `API_PORT` | API | `4000` | HTTP port of the NestJS API |
| `WEB_ORIGIN` | API | `http://localhost:3000` | Only origin allowed by CORS |
| `MONGODB_URI` | API, `verify:mongo` | `mongodb://localhost:27017/helpharbor?directConnection=true` | `directConnection=true` is needed for the single-node replica set |
| `REDIS_URL` | API | `redis://localhost:6379` | Queues, presence and rate limits (later weeks) |
| `SESSION_IDLE_MINUTES` | API | `480` | A session ends after this long without a request |
| `SESSION_ABSOLUTE_HOURS` | API | `168` | A session ends this long after sign-in, however active |
| `COOKIE_SECURE` | API | `false` | `Secure` flag on the session cookie; defaults to `true` when `NODE_ENV=production` |
| `INBOUND_WEBHOOK_SECRET` | API | empty | HMAC secret of the simulated mail provider, at least 32 characters; empty disables the inbound webhook (503). See `docs/tickets-and-inbound.md` |
| `INBOUND_EMAIL_DOMAIN` | API | `inbound.helpharbor.example` | Workspace inbound addresses are `<slug>@<domain>`; ticket replies use `<slug>+<reply token>@<domain>` |
| `INBOUND_SIGNATURE_TOLERANCE_SECONDS` | API | `300` | Signed webhook requests further than this from the server clock are refused |
| `SEED_DEMO_PASSWORD` | `pnpm seed` | empty | Password for every demo account, at least 12 characters; the seed refuses to run without one |
| `API_BASE_URL` | web (server side and build) | `http://localhost:4000` | Where the Next.js server reaches the API, and where `/api/*` is proxied. Rewrites are fixed at build time, so set it before `pnpm build` |
| `APP_VERSION` | API | not set (`0.0.0`) | Reported by the health endpoint |

The API validates its variables at startup and lists every invalid one before exiting, for example:

```text
Invalid API configuration:
  - MONGODB_URI: must be a mongodb:// or mongodb+srv:// connection string
  - REDIS_URL: must be a redis:// or rediss:// URL
```

## Seed data

```bash
# in .env: SEED_DEMO_PASSWORD=<your own, 12+ characters>
pnpm seed
```

`pnpm seed` builds the API, creates collections, validators and indexes, and upserts two synthetic workspaces:

| Workspace | Time zone | Admin | Lead | Agents |
|---|---|---|---|---|
| Acme Cloud (`acme-cloud`) | Europe/Madrid | `marta.admin@acme-cloud.example` | `luis.lead@acme-cloud.example` | `ana.agent@acme-cloud.example`, `pedro.agent@acme-cloud.example` |
| Globex Hosting (`globex-hosting`) | America/Bogota | `grace.admin@globex-hosting.example` | `hugo.lead@globex-hosting.example` | `tomas.agent@globex-hosting.example`, `ana.agent@acme-cloud.example` |

- Ana is an agent in both workspaces, so the workspace switcher has something to switch.
- All companies, people and addresses are fictional and use the reserved `.example` domain; no real data is ever loaded.
- Ids are fixed, so re-running the seed changes nothing. A password is only re-hashed when `SEED_DEMO_PASSWORD` changes.
- The seed refuses an empty, short or placeholder password; the password lives only in your `.env`.

Tickets are not seeded yet; they arrive with inbound ingestion in week 3.

## End-to-end tests

Playwright tests in `apps/e2e` drive the built web app and API in Chromium: sign-in, returnTo handling, workspace switching, sign-out, and the forbidden cases (agent on admin pages, foreign workspace, missing CSRF token, foreign origin, anonymous API calls).

```bash
./scripts/dev.sh infra                                   # MongoDB + Redis
pnpm build && pnpm seed                                  # SEED_DEMO_PASSWORD set in .env
pnpm --filter @helpharbor/e2e exec playwright install chromium   # once
SEED_DEMO_PASSWORD=<same as .env> pnpm e2e
```

Playwright starts the API (`apps/api/dist`) on port 4000 and `next start` on port 3000, or reuses servers already running there. To use other ports, set `E2E_API_PORT`/`E2E_WEB_PORT` and build the web app with the matching `API_BASE_URL`, because the `/api/*` rewrite is fixed at build time. A failed run leaves traces in `apps/e2e/test-results`.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests:

- **checks**: `pnpm install --frozen-lockfile`, then lint, typecheck, tests and build, with the pnpm store cached between runs. The API tests start a throwaway `mongod` through `mongodb-memory-server` (downloaded once and cached), so auth and tenancy run against a real MongoDB without Docker
- **e2e**: starts MongoDB with `./scripts/dev.sh infra`, builds, seeds with a throwaway password and runs the Playwright suite; the report and traces are uploaded when it fails
- **infrastructure**: starts the Compose stack on a clean runner with `./scripts/dev.sh infra` and verifies a MongoDB transaction

All jobs start from a fresh checkout, so a green run also confirms that a clean clone builds.

## Troubleshooting

- **`MongoDB is not running as a replica set`**: the URI is pointing at another MongoDB. Stop it, or change the port mapping in `compose.yaml` and `MONGODB_URI`.
- **API exits with `Invalid API configuration`**: compare `.env` with `.env.example`.
- **Console header says "API is unreachable"**: the API is not running on `API_BASE_URL`; check the `pnpm dev` output.
- **Sign-in says "Sign-in failed"** with `origin_not_allowed` in the API response: open the web app on the exact `WEB_ORIGIN` (for example `localhost`, not `127.0.0.1`).
- **`seed failed: SEED_DEMO_PASSWORD must be set`**: choose a password of 12 or more characters in `.env`.
