#!/usr/bin/env bash
# One-command local startup: checks the toolchain, creates .env, installs
# dependencies, starts MongoDB + Redis, verifies transactions, then runs
# the API and web app in watch mode.
#
#   ./scripts/dev.sh          full startup
#   ./scripts/dev.sh infra    only start MongoDB + Redis and verify them
#   ./scripts/dev.sh check    lint, typecheck, test and build (same as CI)
set -euo pipefail

cd "$(dirname "$0")/.."

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

require() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is not installed. $2"
}

check_toolchain() {
  require node "Install Node.js 22 (see .nvmrc)."
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 22 ] || fail "Node.js $major found; HelpHarbor needs Node.js 22 or newer."
  require pnpm "Run 'corepack enable' to use the pnpm version pinned in package.json."
}

ensure_env() {
  if [ ! -f .env ]; then
    cp .env.example .env
    say "Created .env from .env.example"
  fi
}

start_infra() {
  require docker "Install Docker with the Compose plugin."
  say "Starting MongoDB and Redis"
  docker compose up -d --wait

  say "Waiting for the MongoDB replica set"
  local attempt
  for attempt in $(seq 1 30); do
    if pnpm --silent verify:mongo; then
      return 0
    fi
    echo "MongoDB not ready yet (attempt $attempt/30); retrying in 2s"
    sleep 2
  done
  fail "MongoDB did not accept a transaction. Check 'docker compose logs mongodb'."
}

install_deps() {
  say "Installing dependencies"
  if [ -f pnpm-lock.yaml ]; then
    pnpm install --frozen-lockfile
  else
    # No lockfile committed yet; CI would otherwise refuse to install.
    pnpm install --no-frozen-lockfile
  fi
}

case "${1:-up}" in
  up)
    check_toolchain
    ensure_env
    install_deps
    start_infra
    say "Starting API (http://localhost:4000/api/v1/health) and web (http://localhost:3000)"
    exec pnpm dev
    ;;
  infra)
    check_toolchain
    ensure_env
    install_deps
    start_infra
    ;;
  check)
    check_toolchain
    install_deps
    say "Lint";      pnpm lint
    say "Typecheck"; pnpm typecheck
    say "Test";      pnpm test
    say "Build";     pnpm build
    ;;
  *)
    fail "unknown command '$1' (expected: up, infra, check)"
    ;;
esac
