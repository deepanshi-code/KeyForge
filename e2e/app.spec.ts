import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// Test-only profile values for a throwaway browser context.
const PROFILE = "E2E Tester";
const PASSWORD = "e2e-test-password-1";

// The welcome screen shows on a first visit; every test except its own starts as a returning visitor.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("toolkit:welcomed", "1"));
});

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
  await page.locator(".more-options summary").click();
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
      // Dark is the app's default, so choose the theme explicitly rather than relying on the system setting.
      await page.addInitScript(theme => localStorage.setItem("toolkit:theme", theme), scheme);
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

test("a shared shortlist link shows its names and saves them only on request", async ({ page }) => {
  const payload = Buffer.from(JSON.stringify({ v: 1, i: [["username", "vesper_flux"], ["project-name", "Form Saathi"], ["password", "hunter2"]] }))
    .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await page.goto(`./#share=${payload}`);
  const dialog = page.locator("#shareDialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("vesper_flux");
  await expect(dialog).toContainText("Form Saathi");
  await expect(dialog).not.toContainText("hunter2"); // passwords are never shared
  await expect(page).not.toHaveURL(/share=/); // removed from the address bar
  await expect(page.locator("#savedCount")).toBeHidden(); // nothing saved yet
  await page.locator("#shareSave").click();
  await expect(page.locator("#savedCount")).toHaveText("2");
});

test("invalid options clear old results instead of leaving them clickable", async ({ page }) => {
  await page.goto("./#password");
  await expect(results(page)).toHaveCount(8);
  await page.locator(".more-options summary").click();
  for (const label of ["Uppercase (A–Z)", "Lowercase (a–z)", "Numbers (0–9)", "Symbols (!@#…)"]) {
    await page.getByText(label, { exact: true }).click();
  }
  await expect(page.locator("#formError")).toContainText("at least one");
  await expect(results(page)).toHaveCount(0);
  await expect(page.locator("#resultCount")).toHaveText("0");
});

test("the guided start sets up the right generator and options", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: /unmistakably you/ })).toBeVisible();
  await page.getByRole("link", { name: "What are you naming?" }).first().click();
  await expect(page).toHaveURL(/#tools$/);
  await page.locator('[data-preset="instagram"]').click();
  await expect(page).toHaveURL(/#username$/);
  await expect(page.getByLabel("Platform")).toHaveValue("instagram");
  await expect(results(page)).toHaveCount(8);
  for (const value of await page.locator("#results .value").allTextContents()) expect(value.length).toBeLessThanOrEqual(30);
});

test("live preview shows a name as a profile, website and logo", async ({ page }) => {
  await page.goto("./#username");
  const name = await firstValue(page);
  await page.locator("#results .preview-btn").first().click();
  const dialog = page.locator("#previewDialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#previewTitle")).toHaveText(name ?? "");
  for (const view of ["Social profile", "Website", "Logo"]) {
    await dialog.getByRole("button", { name: view, exact: true }).click();
    await expect(dialog.locator(".preview-stage svg").first()).toBeVisible();
  }
  expect((await new AxeBuilder({ page }).include("#previewDialog").analyze()).violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});

test("the create screen has no serious accessibility issues", async ({ page }) => {
  await page.goto("./#project-name");
  await expect(results(page)).toHaveCount(8);
  await page.waitForTimeout(400);
  expect((await new AxeBuilder({ page }).analyze()).violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});

test("first visit: the welcome greets you, then Get started opens the app and remembers it", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => localStorage.removeItem("toolkit:welcomed")); // runs after beforeEach's: a true first visit
  await page.goto("./");
  const welcome = page.locator("#welcome");
  await expect(welcome).toBeVisible();
  await expect(page.locator("#helloText")).toHaveText("नमस्ते");
  // The bundled handwriting font really loads in the built site (its path survives inlining).
  await expect.poll(() => page.evaluate(() => [...document.fonts].some(f => f.family.includes("Kalam") && f.status === "loaded"))).toBe(true);
  await expect(page.getByRole("button", { name: "Get started" })).toBeVisible({ timeout: 30_000 });
  expect((await new AxeBuilder({ page }).include("#welcome").analyze()).violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(welcome).toBeHidden();
  // The app itself saved that the welcome was seen (the test's own setup removed that flag).
  expect(await page.evaluate(() => localStorage.getItem("toolkit:welcomed"))).toBe("1");
});

test("the welcome can be skipped straight away", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("toolkit:welcomed"));
  await page.goto("./");
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.locator("#welcome")).toBeHidden();
  await expect(page.getByRole("heading", { name: /Forge a name/ })).toBeVisible();
});

test("How it works is its own screen: three steps with live pictures of the real app", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("link", { name: "How it works" }).first().click();
  await expect(page).toHaveURL(/#how$/);
  await expect(page.locator("#homeView")).toBeHidden();
  await expect(page.getByRole("heading", { name: /Three steps to a name/ })).toBeVisible();
  await expect(page.locator(".step")).toHaveCount(3);
  // Each picture is a working miniature of the app, filled with freshly generated names.
  await expect(page.locator("#shot1 .mini-tile")).not.toHaveCount(0);
  await expect(page.locator("#shot2 .mini-card")).not.toHaveCount(0);
  await expect(page.locator("#shot2 .mock")).toBeVisible();
  await expect(page.locator("#shot3 .mini-card.starred")).not.toHaveCount(0);
});

test("How it works and All tools have no serious accessibility issues in either theme", async ({ page }) => {
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(t => localStorage.setItem("toolkit:theme", t), theme);
    for (const screen of ["how", "tools"]) {
      await page.goto(`./#${screen}`);
      await expect(page.locator(`#${screen}View`)).toBeVisible();
      await page.waitForTimeout(400);
      expect((await new AxeBuilder({ page }).analyze()).violations.filter(v => v.impact === "serious" || v.impact === "critical"), `${screen} ${theme}`).toEqual([]);
    }
  }
});
