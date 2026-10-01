import { defineConfig, devices } from "@playwright/test";
import sparticuz from "@sparticuz/chromium";

/**
 * E2E runs against two production servers built from the same `.next` output:
 *   :3100 — the normal demo
 *   :3101 — the demo with Hacker News disabled, to test graceful degradation
 * Run `npm run setup && npm run build` first.
 * Set PW_CHROMIUM_PATH to use a specific Chromium binary (e.g. in sandboxes
 * where `npx playwright install chromium` cannot download browsers).
 */
const customChromium = process.env.PW_CHROMIUM_PATH;
// Serverless-oriented flags such as --single-process break multiple browser contexts; drop them.
const chromiumArgs = sparticuz.args.filter((a: string) => !/^--(single-process|no-zygote)/.test(a));

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    ...(customChromium ? { launchOptions: { executablePath: customChromium, args: chromiumArgs } } : {}),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, grepInvert: /@mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"], ...(customChromium ? { launchOptions: { executablePath: customChromium, args: chromiumArgs } } : {}) }, grep: /@mobile/ },
  ],
  webServer: [
    { command: "npx next start -p 3100", url: "http://127.0.0.1:3100/api/universe", reuseExistingServer: !process.env.CI, timeout: 120_000 },
    {
      command: "npx next start -p 3101",
      url: "http://127.0.0.1:3101/api/universe",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { ALTSIGNAL_DISABLED_PROVIDERS: "hackernews" },
    },
  ],
});
