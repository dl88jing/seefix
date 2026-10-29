/**
 * Capture real screenshots + a short screen recording of https://seefix.vercel.app
 * running Muse Spark Open identify via Baseten on /lab.
 */
import { chromium } from "playwright-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "captures");
const PLATE = path.join(__dirname, "assets", "sample-plate.jpg");
const BASE = "https://seefix.vercel.app";

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
  headless: true,
});

const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  recordVideo: { dir: path.join(OUT, "raw-video"), size: { width: 1920, height: 1080 } },
});
const page = await context.newPage();

async function shot(name) {
  const dest = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: dest, fullPage: false });
  console.log("shot", name, dest);
  return dest;
}

// --- Landing ---
await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1200);
await shot("01-landing");

// Scroll hero features if present
await page.evaluate(() => window.scrollTo({ top: 500, behavior: "instant" }));
await page.waitForTimeout(600);
await shot("02-landing-mid");
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));

// --- Lab ---
await page.goto(BASE + "/lab", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1500);
await shot("03-lab-empty");

// Upload plate
const fileInput = page.locator('input[type="file"]');
await fileInput.setInputFiles(PLATE);
await page.waitForTimeout(1500);
await shot("04-lab-uploaded");

// Click identify
const identifyBtn = page.getByRole("button", { name: /POST \/api\/identify/i });
await identifyBtn.click();
await shot("05-lab-identifying");

// Wait for JSON result with appliance (up to 90s)
await page.waitForFunction(
  () => {
    const pre = Array.from(document.querySelectorAll("pre"));
    return pre.some((el) => /"appliance"/.test(el.textContent || "") && /"provider"/.test(el.textContent || ""));
  },
  { timeout: 90000 },
);
await page.waitForTimeout(800);
await shot("06-lab-result");

// Scroll identify panel into focus / crop-friendly frame
await identifyBtn.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await shot("07-lab-result-focus");

// Health strip often at top — capture again after scroll top
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
await page.waitForTimeout(400);
await shot("08-lab-top-health");

const video = page.video();
await context.close();
await browser.close();

if (video) {
  const vpath = await video.path();
  const dest = path.join(OUT, "lab-identify.webm");
  fs.renameSync(vpath, dest);
  console.log("video", dest);
}

// Convert webm -> mp4 for HyperFrames
import { spawnSync } from "child_process";
const webm = path.join(OUT, "lab-identify.webm");
const mp4 = path.join(OUT, "lab-identify.mp4");
if (fs.existsSync(webm)) {
  const r = spawnSync(
    "ffmpeg",
    ["-y", "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", mp4],
    { encoding: "utf8" },
  );
  console.log("ffmpeg", r.status === 0 ? "ok" : r.stderr?.slice(-400));
}

console.log("DONE");
