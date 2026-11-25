import { type APIRequestContext, type Page, expect } from "@playwright/test";

/** Demo accounts created by `pnpm seed` (`apps/api/src/seed/demo-identities.ts`). */
export const DEMO = {
  marta: "marta.admin@acme-cloud.example",
  luis: "luis.lead@acme-cloud.example",
  ana: "ana.agent@acme-cloud.example",
  pedro: "pedro.agent@acme-cloud.example",
  grace: "grace.admin@globex-hosting.example",
} as const;

/** The seed and the tests read the same variable, so the password never lives in the repository. */
export function demoPassword(): string {
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password) throw new Error("Set SEED_DEMO_PASSWORD to the password used for `pnpm seed`");
  return password;
}

/** Fills the sign-in form; the caller decides what a successful sign-in looks like. */
export async function submitSignIn(page: Page, email: string, password = demoPassword()): Promise<void> {
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs in from `/login` and waits for the default landing page. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await submitSignIn(page, email);
  await expect(page).toHaveURL(/\/console$/);
}

/** The CSRF token of the page's current session, as the web app reads it. */
export async function csrfToken(request: APIRequestContext): Promise<string> {
  const res = await request.get("/api/v1/auth/session");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { csrfToken: string };
  return body.csrfToken;
}

export async function errorCode(res: { json(): Promise<unknown> }): Promise<string> {
  const body = (await res.json()) as { error?: { code?: string } };
  return body.error?.code ?? "";
}
