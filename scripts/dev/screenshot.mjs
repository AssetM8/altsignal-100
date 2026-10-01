// Dev helper: capture full-page screenshots of running pages.
// Usage: node scripts/dev/screenshot.mjs http://localhost:3000/ out.png [width]
import { chromium } from "playwright-core";
const [url, out, width = "1440"] = process.argv.slice(2);
const executablePath = process.env.PW_CHROMIUM_PATH || (await import("@sparticuz/chromium").then((m) => m.default.executablePath()));
const args = process.env.PW_CHROMIUM_PATH ? [] : (await import("@sparticuz/chromium")).default.args;
const browser = await chromium.launch({ executablePath, args, headless: true });
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(Number(process.env.WAIT ?? 1500));
await page.screenshot({ path: out, fullPage: true });
console.info(errors.length ? `console errors:\n${errors.join("\n")}` : "no console errors");
await browser.close();
