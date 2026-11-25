import { expect, test } from "@playwright/test";
import { DEMO, signIn, submitSignIn } from "./support";

test.describe("sign-in", () => {
  test("sends an anonymous visitor to sign-in and back to the page they asked for", async ({ page }) => {
    await page.goto("/settings/members");
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fsettings%2Fmembers$/);

    await submitSignIn(page, DEMO.luis);
    await expect(page).toHaveURL(/\/settings\/members$/);
    await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  });

  test("gives the same answer for a wrong password and an unknown email", async ({ page }) => {
    await page.goto("/login");
    await submitSignIn(page, DEMO.ana, "not the demo password");
    // Scoped to the form: Next.js adds its own (empty) route announcer alert.
    const alert = page.locator("form").getByRole("alert");
    await expect(alert).toHaveText("Email or password is incorrect.");

    await submitSignIn(page, "nobody@acme-cloud.example", "not the demo password");
    await expect(alert).toHaveText("Email or password is incorrect.");
    await expect(page).toHaveURL(/\/login/);

    const session = await page.request.get("/api/v1/auth/session");
    expect(session.status()).toBe(401);
  });

  test("never follows an off-site returnTo", async ({ page }) => {
    for (const target of ["https://evil.example/", "//evil.example/console", "/\\evil.example"]) {
      await page.context().clearCookies();
      await page.goto(`/login?returnTo=${encodeURIComponent(target)}`);
      await submitSignIn(page, DEMO.pedro);
      await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/console$/);
    }
  });

  test("keeps the session cookie out of reach of page scripts", async ({ page }) => {
    await signIn(page, DEMO.pedro);
    const cookies = await page.context().cookies();
    const session = cookies.find((c) => c.name === "hh_session");
    expect(session).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
    expect(await page.evaluate(() => document.cookie)).not.toContain("hh_session");
  });

  test("switches workspace and keeps the choice after a reload", async ({ page }) => {
    await signIn(page, DEMO.ana);
    await expect(page.getByText("Tickets for Acme Cloud")).toBeVisible();

    await page.getByLabel("Workspace").selectOption("globex-hosting");
    await expect(page.getByText("Tickets for Globex Hosting")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Tickets for Globex Hosting")).toBeVisible();
    await expect(page.getByLabel("Workspace")).toHaveValue("globex-hosting");
  });

  test("signing out ends the session on the server", async ({ page }) => {
    await signIn(page, DEMO.pedro);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/console");
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fconsole$/);
    expect((await page.request.get("/api/v1/auth/session")).status()).toBe(401);
  });
});
