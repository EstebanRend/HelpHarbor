import { expect, test } from "@playwright/test";
import { DEMO, csrfToken, errorCode, signIn } from "./support";

test.describe("forbidden access", () => {
  test("an agent does not see admin areas, and the API refuses them too", async ({ page }) => {
    await signIn(page, DEMO.pedro);
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("listitem")).toHaveText(["Queue"]);

    await page.goto("/settings/members");
    await expect(page.getByText("Only workspace admins can manage members.")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);

    // Hiding the link is cosmetic; the API is what says no.
    const members = await page.request.get("/api/v1/tenant/members");
    expect(members.status()).toBe(403);
    expect(await errorCode(members)).toBe("forbidden");
  });

  test("an admin sees the members of their own workspace only", async ({ page }) => {
    await signIn(page, DEMO.marta);
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("listitem")).toHaveCount(5);

    await page.getByRole("link", { name: "Members" }).click();
    await expect(page).toHaveURL(/\/settings\/members$/);
    const rows = page.getByRole("table").locator("tbody tr");
    await expect(rows).toHaveCount(4);
    await expect(rows.filter({ hasText: "globex-hosting.example" })).toHaveCount(0);
  });

  test("cannot switch into a workspace the user does not belong to", async ({ page }) => {
    await signIn(page, DEMO.grace);
    const token = await csrfToken(page.request);

    const res = await page.request.post("/api/v1/auth/switch-tenant", {
      data: { tenantSlug: "acme-cloud" },
      headers: { "x-csrf-token": token },
    });
    expect(res.status()).toBe(404);
    expect(await errorCode(res)).toBe("not_found");

    await page.reload();
    await expect(page.getByText("Tickets for Globex Hosting")).toBeVisible();
  });

  test("refuses a state-changing request without the CSRF token", async ({ page }) => {
    await signIn(page, DEMO.ana);

    const res = await page.request.post("/api/v1/auth/switch-tenant", { data: { tenantSlug: "globex-hosting" } });
    expect(res.status()).toBe(403);
    expect(await errorCode(res)).toBe("csrf_token_invalid");

    const logout = await page.request.post("/api/v1/auth/logout");
    expect(logout.status()).toBe(403);
    await page.reload();
    await expect(page.getByText("Tickets for Acme Cloud")).toBeVisible();
  });

  test("refuses sign-in posted from another origin", async ({ request }) => {
    const res = await request.post("/api/v1/auth/login", {
      data: { email: DEMO.marta, password: "irrelevant password" },
      headers: { origin: "https://evil.example" },
    });
    expect(res.status()).toBe(403);
    expect(await errorCode(res)).toBe("origin_not_allowed");
  });

  test("answers 401 to anonymous API calls", async ({ request }) => {
    for (const path of ["/api/v1/auth/session", "/api/v1/tenant", "/api/v1/tenant/members"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(401);
      expect(await errorCode(res)).toBe("unauthenticated");
    }
  });
});
