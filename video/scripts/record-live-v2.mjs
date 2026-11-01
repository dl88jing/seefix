/**
 * Record simulated-user clips of https://seefix.vercel.app with cursor + ripples.
 */
import { chromium } from "playwright-core";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "captures");
const PLATE = path.join(ROOT, "assets", "sample-plate.jpg");
const BASE = process.env.BASE_URL || "https://seefix.vercel.app";
const W = 1920;
const H = 1080;

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, "raw"), { recursive: true });

const CURSOR_JS = `
(() => {
  if (window.__demoCursor) return;
  window.__demoCursor = true;
  const style = document.createElement('style');
  style.textContent = \`
    #__demo_cursor {
      position: fixed; z-index: 2147483647; width: 22px; height: 22px;
      margin-left: -3px; margin-top: -3px; pointer-events: none;
      background: radial-gradient(circle at 30% 30%, #fff 0 18%, #34d399 22% 70%, transparent 72%);
      border: 2px solid #fff; border-radius: 50% 50% 50% 0; transform: rotate(-15deg);
      box-shadow: 0 2px 10px rgba(0,0,0,.45), 0 0 0 3px rgba(52,211,153,.35);
      transition: transform 40ms linear;
    }
    #__demo_cursor.clicking { transform: rotate(-15deg) scale(.82); }
    .__demo_ripple {
      position: fixed; z-index: 2147483646; width: 14px; height: 14px; border-radius: 50%;
      border: 2px solid rgba(52,211,153,.9); pointer-events: none;
      transform: translate(-50%,-50%) scale(1); opacity: .9;
      animation: __demo_ripple_anim .55s ease-out forwards;
    }
    @keyframes __demo_ripple_anim {
      to { transform: translate(-50%,-50%) scale(4.2); opacity: 0; }
    }
    #__demo_badge {
      position: fixed; left: 24px; bottom: 24px; z-index: 2147483647;
      background: rgba(9,9,11,.88); border: 1px solid rgba(52,211,153,.45);
      color: #e4e4e7; font: 600 14px Inter,system-ui,sans-serif;
      padding: 8px 14px; border-radius: 999px; pointer-events: none;
      display: flex; align-items: center; gap: 8px;
    }
    #__demo_badge::before {
      content: ''; width: 8px; height: 8px; border-radius: 50%;
      background: #34d399; box-shadow: 0 0 8px #34d399;
    }
  \`;
  document.documentElement.appendChild(style);
  const cur = document.createElement('div');
  cur.id = '__demo_cursor';
  document.documentElement.appendChild(cur);
  const badge = document.createElement('div');
  badge.id = '__demo_badge';
  badge.textContent = 'Live app · seefix.vercel.app';
  document.documentElement.appendChild(badge);
  let x = 40, y = 40;
  const move = (nx, ny) => { x = nx; y = ny; cur.style.left = x + 'px'; cur.style.top = y + 'px'; };
  window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY), true);
  window.addEventListener('mousedown', (e) => {
    cur.classList.add('clicking');
    const r = document.createElement('div');
    r.className = '__demo_ripple';
    r.style.left = e.clientX + 'px';
    r.style.top = e.clientY + 'px';
    document.documentElement.appendChild(r);
    setTimeout(() => r.remove(), 600);
  }, true);
  window.addEventListener('mouseup', () => cur.classList.remove('clicking'), true);
  window.__setDemoBadge = (t) => { badge.textContent = t; };
  move(40, 40);
})();
`;

async function humanMove(page, x, y, steps = 20) {
  await page.mouse.move(x, y, { steps });
}

async function humanClickLocator(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("no bounding box for click");
  const x = box.x + Math.min(box.width * 0.55, box.width - 4);
  const y = box.y + box.height * 0.5;
  await humanMove(page, x, y, 24);
  await page.waitForTimeout(200);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function withPage(name, fn) {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars", "--autoplay-policy=no-user-gesture-required"],
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: path.join(OUT, "raw"), size: { width: W, height: H } },
  });
  const page = await context.newPage();
  await page.addInitScript(CURSOR_JS);
  console.log(`[${name}] start`);
  try {
    await fn(page);
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();
    if (video) {
      const vpath = await video.path();
      const webm = path.join(OUT, `${name}.webm`);
      const mp4 = path.join(OUT, `${name}.mp4`);
      fs.renameSync(vpath, webm);
      const r = spawnSync(
        "ffmpeg",
        ["-y", "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "18", "-an", mp4],
        { encoding: "utf8" },
      );
      if (r.status !== 0) {
        console.error(`[${name}] ffmpeg failed`, r.stderr?.slice(-500));
        throw new Error("ffmpeg failed for " + name);
      }
      const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", mp4], { encoding: "utf8" });
      console.log(`[${name}] mp4`, mp4, "dur", probe.stdout.trim());
    }
  }
}

await withPage("01-landing", async (page) => {
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__setDemoBadge && window.__setDemoBadge("Landing · seefix.vercel.app"));
  // Explore hero
  await humanMove(page, 480, 320, 30);
  await page.waitForTimeout(900);
  await humanMove(page, 1100, 420, 28);
  await page.waitForTimeout(700);
  // Scroll features
  await page.evaluate(() => window.scrollBy({ top: 520, behavior: "smooth" }));
  await page.waitForTimeout(1400);
  await humanMove(page, 640, 500, 20);
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollBy({ top: 480, behavior: "smooth" }));
  await page.waitForTimeout(1400);
  // Find and click Lab / Try lab link
  const labLink = page.getByRole("link", { name: /lab|try|open lab/i }).first();
  if (await labLink.count()) {
    await humanClickLocator(page, labLink);
    await page.waitForTimeout(2000);
  } else {
    await page.goto(BASE + "/lab", { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1500);
  }
  await page.evaluate(() => window.__setDemoBadge && window.__setDemoBadge("Open /lab"));
  await page.waitForTimeout(2000);
});

await withPage("02-lab-identify", async (page) => {
  await page.goto(BASE + "/lab", { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1600);
  await page.evaluate(() => window.__setDemoBadge && window.__setDemoBadge("Lab · upload model plate"));
  // Hover around empty lab
  await humanMove(page, 700, 360, 25);
  await page.waitForTimeout(800);

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(PLATE);
  await page.waitForTimeout(1800);
  await page.evaluate(() => window.__setDemoBadge && window.__setDemoBadge("Plate uploaded · ready to identify"));
  await humanMove(page, 520, 420, 18);
  await page.waitForTimeout(900);

  const identifyBtn = page.getByRole("button", { name: /POST \/api\/identify|Identify/i }).first();
  await page.evaluate(() => window.__setDemoBadge && window.__setDemoBadge("Click Identify · Muse Spark Open"));
  await humanClickLocator(page, identifyBtn);

  // Wait for live result
  await page.waitForFunction(
    () => {
      const pre = Array.from(document.querySelectorAll("pre, code, [data-result], .font-mono"));
      const txt = pre.map((el) => el.textContent || "").join("\n");
      return /"appliance"/.test(txt) && /"provider"/.test(txt);
    },
    { timeout: 120000 },
  );
  await page.evaluate(() => window.__setDemoBadge && window.__setDemoBadge("Live Muse Spark · provider baseten"));
  await page.waitForTimeout(1200);
  // Scroll result into view / explore
  await page.evaluate(() => {
    const pre = Array.from(document.querySelectorAll("pre")).find((el) => /"appliance"/.test(el.textContent || ""));
    pre?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
  await page.waitForTimeout(1500);
  await humanMove(page, 900, 520, 22);
  await page.waitForTimeout(2500);
  await humanMove(page, 640, 380, 18);
  await page.waitForTimeout(3000);
});

console.log("DONE");
