import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// Test-only profile values for a throwaway browser context.
const PROFILE = "E2E Tester";
const PASSWORD = "e2e-test-password-1";

const results = (page: Page) => page.locator("#results .result");
const firstValue = (page: Page) => page.locator("#results .value").first().textContent();

test("generates results and regenerates with R", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("./");
  await expect(results(page)).toHaveCount(8);
  const before = await firstValue(page);
  await page.locator("body").press("r");
  await expect.poll(() => firstValue(page)).not.toBe(before);
  expect(errors).toEqual([]);
});

test("GitHub preset only produces valid GitHub usernames", async ({ page }) => {
  await page.goto("./#username");
  await page.getByLabel("Underscore _").check();
  await page.getByLabel("Platform").selectOption("github");
  // Results regenerate shortly after the change; wait until the new batch is on screen.
  const valid = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9]))*$/;
  await expect.poll(async () => (await page.locator("#results .value").allTextContents()).every(v => valid.test(v) && v.length <= 39)).toBe(true);
  await expect(results(page)).toHaveCount(8);
});

test("passwords are never saved or exported", async ({ page }) => {
  await page.goto("./#password");
  await expect(results(page)).toHaveCount(8);
  await expect(page.locator("#results .star")).toHaveCount(0);
  await expect(page.locator("#csvBtn")).toBeHidden();
});

test("a profile keeps saved names locked until the right password is entered", async ({ page }) => {
  await page.goto("./#username");
  await page.locator("#accountBtn").click();
  await page.getByLabel("Profile name").fill(PROFILE);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create profile" }).click();
  await expect(page.locator("#authDialog")).not.toBeVisible();

  const starred = await firstValue(page);
  await page.locator("#results .star").first().click();
  await expect(page.locator("#savedCount")).toHaveText("1");

  // Reload: the app opens locked, with nothing saved on show.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.locator("#savedCount")).toBeHidden();

  await page.getByLabel("Password", { exact: true }).fill("not-the-password");
  await page.locator("#authSubmit").click();
  await expect(page.getByText("Wrong password. Try again.")).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.locator("#authSubmit").click();
  await expect(page.locator("#savedCount")).toHaveText("1");
  await page.locator("#libraryBtn").click();
  await expect(page.locator("#libList")).toContainText(starred ?? "");
});

test.describe("accessibility (axe)", () => {
  const serious = async (page: Page) =>
    (await new AxeBuilder({ page }).analyze()).violations.filter(v => v.impact === "serious" || v.impact === "critical");

  for (const scheme of ["light", "dark"] as const) {
    test(`main screen has no serious issues (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("./");
      await expect(results(page)).toHaveCount(8);
      await page.waitForTimeout(400); // let the row fade-in finish so colours are final
      expect(await serious(page)).toEqual([]);
    });
  }

  test("sign-in dialog has no serious issues", async ({ page }) => {
    await page.goto("./");
    await page.locator("#accountBtn").click();
    await expect(page.locator("#authDialog")).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });
});
