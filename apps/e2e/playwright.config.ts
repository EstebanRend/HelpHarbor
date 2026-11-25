import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against the production builds (`pnpm build`) of the API and web app,
 * on a MongoDB that `pnpm seed` has filled. Both servers are started here;
 * locally, already-running ones on the same ports are reused.
 *
 * The web build bakes in `API_BASE_URL`, so when changing E2E_API_PORT,
 * build the web app with the matching `API_BASE_URL`.
 */
const CI = Boolean(process.env.CI);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3000);
const API_PORT = Number(process.env.E2E_API_PORT ?? 4000);
const WEB_URL = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node dist/main.js",
      cwd: "../api",
      url: `http://localhost:${API_PORT}/api/v1/health`,
      env: { API_PORT: String(API_PORT), WEB_ORIGIN: WEB_URL },
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      command: `pnpm exec next start --port ${WEB_PORT}`,
      cwd: "../web",
      url: `${WEB_URL}/login`,
      // Server Components call the API directly; `/api/*` rewrites were fixed at build time.
      env: { API_BASE_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
  ],
});
