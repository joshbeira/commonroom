import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("the demo is navigable, accessible, and preserves a created expense", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome home." }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Explore the demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Good to have you home, Alex." }),
  ).toBeVisible();
  await expect(page.getByText("All caught up")).toBeVisible();
  await page.screenshot({
    path: "../docs/images/dashboard.png",
    fullPage: true,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page.getByLabel("What was it for?").fill("A plant for the kitchen");
  await page.getByLabel("Amount (£)").fill("10.01");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add expense", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: /A plant for the kitchen Groceries/ })
    .click();
  await expect(
    page.getByRole("dialog").getByText("£2.51", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("£2.50", { exact: true }),
  ).toHaveCount(3);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(
    page.getByRole("button", { name: /A plant for the kitchen Groceries/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Network lab", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A little transparency." }),
  ).toBeVisible();
  await expect(page.getByText("Last 1 requests")).toBeVisible();
  await page.getByRole("button", { name: "Measure request" }).click();
  await expect(page.getByText("Last 2 requests")).toBeVisible();
  await page.screenshot({
    path: "../docs/images/network-lab.png",
    fullPage: true,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Audit chain verified" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review payment" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirm", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  expect(failures).toEqual([]);
});

test("mobile navigation and expense dialog fit a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Good to have you home, Alex." }),
  ).toBeVisible();
  await page.screenshot({ path: "../docs/images/mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Balances", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Good friends. Clear balances." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("two browser contexts see their own isolated demo workspaces", async ({
  browser,
}) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const p1 = await a.newPage();
  const p2 = await b.newPage();
  for (const page of [p1, p2]) {
    await page.goto("http://127.0.0.1:8001");
    await page.getByRole("button", { name: "Explore the demo" }).click();
    await expect(
      page.getByRole("heading", { name: "Good to have you home, Alex." }),
    ).toBeVisible();
  }
  await p1.getByRole("button", { name: "Add expense", exact: true }).click();
  await p1.getByLabel("What was it for?").fill("Only in the first household");
  await p1.getByLabel("Amount (£)").fill("24.00");
  await p1
    .getByRole("dialog")
    .getByRole("button", { name: "Add expense", exact: true })
    .click();
  await expect(p1.getByRole("dialog")).not.toBeVisible();
  await p2.reload();
  await expect(
    p2.getByRole("button", { name: /Only in the first household/ }),
  ).toHaveCount(0);
  await a.close();
  await b.close();
});
