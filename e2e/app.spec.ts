import fs from "node:fs";
import { expect, test } from "@playwright/test";

test.describe("dashboard", () => {
  test("loads with demo labelling, KPIs, charts and an anomaly feed", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("demo-badge")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Market overview" })).toBeVisible();
    await expect(page.getByLabel("Key figures").getByText("Market mood")).toBeVisible();
    await expect(page.getByRole("list", { name: "Anomaly feed, newest first" }).getByRole("listitem").first()).toBeVisible();
    // Lazy-loaded charts render real SVG
    await expect(page.locator(".recharts-surface").first()).toBeVisible();
    await expect(page.getByRole("img", { name: /Market mood/ })).toBeVisible();
  });

  test("filters by sector through the URL", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("filter-sector").selectOption("Energy");
    await expect(page).toHaveURL(/sector=Energy/);
    await expect(page.getByRole("region", { name: "Sector sentiment heatmap" }).locator("tbody tr")).toHaveCount(1);
  });
});

test("searches for a stock from the header and opens it", async ({ page }) => {
  await page.goto("/");
  const box = page.getByRole("combobox", { name: "Search ticker or company" });
  await box.fill("nvid");
  await expect(page.getByRole("option", { name: /NVDA/ })).toBeVisible();
  await box.press("Enter");
  await expect(page).toHaveURL(/\/company\/NVDA/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("NVDA");
});

test.describe("stock explorer", () => {
  test("lists 100 companies and filters by sector, preset and search", async ({ page }) => {
    await page.goto("/explorer");
    await expect(page.getByTestId("explorer-count")).toHaveText(/^100 of 100 companies/);
    await page.getByTestId("explorer-sector").selectOption("Energy");
    await expect(page.getByTestId("explorer-count")).toHaveText(/^3 of 100/);
    await page.getByTestId("explorer-sector").selectOption("all");
    await page.getByTestId("explorer-search").fill("micro");
    await expect(page.getByTestId("explorer-table").locator("tbody tr")).toHaveCount(3); // Microsoft, Micron, Advanced Micro Devices
    await page.getByTestId("explorer-search").fill("");
    await page.getByRole("button", { name: "Divergent sources" }).click();
    const n = Number((await page.getByTestId("explorer-count").textContent())?.split(" ")[0]);
    expect(n).toBeLessThan(100);
  });

  test("sorts by score and opens a company", async ({ page }) => {
    await page.goto("/explorer");
    await page.getByRole("button", { name: /Alt score/ }).click();
    const first = page.getByTestId("explorer-table").locator("tbody tr").first().getByRole("link");
    const t = (await first.textContent())?.trim();
    await first.click();
    await expect(page).toHaveURL(new RegExp(`/company/${t?.replace(".", "\\.")}`));
  });

  test("exports a labelled CSV of the filtered rows", async ({ page }) => {
    await page.goto("/explorer");
    await page.getByTestId("explorer-sector").selectOption("Utilities");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
    expect(dl.suggestedFilename()).toMatch(/^altsignal100-DEMO-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = fs.readFileSync((await dl.path()) as string, "utf8");
    expect(text).toContain("DEMO DATA");
    const dataLines = text.split("\n").filter((l) => !l.startsWith("#"));
    expect(dataLines[0]).toMatch(/^rank,ticker,name/);
    expect(dataLines.length - 1).toBe(3);
  });
});

test("company page explains the score and shows sources and items", async ({ page }) => {
  await page.goto("/company/BA");
  await expect(page.getByRole("region", { name: "Why this score" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Score components" })).toBeVisible();
  await expect(page.getByTestId("source-table").locator("tbody tr")).toHaveCount(5);
  await expect(page.getByRole("region", { name: /Representative items/ })).toContainText("Matched");
  await expect(page.getByRole("region", { name: /Anomaly timeline/ })).toBeVisible();
});

test("unknown tickers get a helpful not-found page", async ({ page }) => {
  const res = await page.goto("/company/ZZZZ");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Not in the universe" })).toBeVisible();
});

test("runs a basic Signal Lab analysis", async ({ page }) => {
  await page.goto("/lab");
  await page.getByTestId("lab-feature-sentimentChange").check();
  await page.getByTestId("lab-horizon").selectOption("5");
  await page.getByTestId("lab-run").click();
  await expect(page.getByTestId("lab-verdict")).toHaveText(/^(Showed|Did not demonstrate)/, { timeout: 60_000 });
  await expect(page.getByTestId("lab-results")).toContainText("Test (held out)");
  await expect(page).toHaveURL(/run=[0-9a-f-]{36}/);
});

test.describe("graceful degradation (Hacker News disabled)", () => {
  test.use({ baseURL: "http://127.0.0.1:3101" });
  test("status, overview and company pages still work and say the source is unavailable", async ({ page }) => {
    await page.goto("/status");
    const row = page.getByTestId("status-sources").locator("tr", { hasText: "Hacker News" });
    await expect(row).toContainText("Unavailable");
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Market overview" })).toBeVisible();
    await page.goto("/company/NVDA");
    await expect(page.getByTestId("source-table").locator("tr", { hasText: "Hacker News" })).toContainText("Unavailable");
    await expect(page.getByTestId("company-score")).not.toHaveText("");
  });
});

test("@mobile pages fit the screen and navigation is reachable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Market overview" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Stock explorer" })).toBeVisible();
  for (const path of ["/", "/explorer", "/company/NVDA", "/lab", "/status", "/methodology"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
  }
});
