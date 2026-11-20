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

- agent console: <http://localhost:3000> (redirects to `/console`; the header shows whether the API is reachable)
- API health: <http://localhost:4000/api/v1/health>

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
| `API_BASE_URL` | web (server side) | `http://localhost:4000` | Where the Next.js server reaches the API; the browser never talks to MongoDB |
| `APP_VERSION` | API | not set (`0.0.0`) | Reported by the health endpoint |

The API validates its variables at startup and lists every invalid one before exiting, for example:

```text
Invalid API configuration:
  - MONGODB_URI: must be a mongodb:// or mongodb+srv:// connection string
  - REDIS_URL: must be a redis:// or rediss:// URL
```

## Seed data

There is no seed yet. The plan, starting with tenancy in week 2:

- `pnpm seed` will create two synthetic tenants ("Acme Cloud" and a second company) with one admin, one team lead and two agents each, so tenant isolation can be demonstrated from the first login.
- All companies, people, email addresses and tickets are generated and clearly fictional; no real customer data is ever loaded.
- The seed will be idempotent (upserts keyed by tenant slug and email), so it can be re-run safely on an existing database.
- Demo passwords will come from `.env`, never from the repository.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests:

- **checks**: `pnpm install`, then lint, typecheck, unit tests and build, with the pnpm store cached between runs
- **infrastructure**: starts the Compose stack on a clean runner with `./scripts/dev.sh infra` and verifies a MongoDB transaction

Both jobs start from a fresh checkout, so a green run also confirms that a clean clone builds.

## Troubleshooting

- **`MongoDB is not running as a replica set`**: the URI is pointing at another MongoDB. Stop it, or change the port mapping in `compose.yaml` and `MONGODB_URI`.
- **API exits with `Invalid API configuration`**: compare `.env` with `.env.example`.
- **Console header says "API is unreachable"**: the API is not running on `API_BASE_URL`; check the `pnpm dev` output.
