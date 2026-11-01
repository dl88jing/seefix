/**
 * Longer SeeFix live recording — landing + identify + linger on results (+ optional safety).
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
    }
    #__demo_badge::before {
      content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 50%;
      background: #34d399; box-shadow: 0 0 8px #34d399; margin-right: 8px;
      vertical-align: middle;
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
  const move = (nx, ny) => { cur.style.left = nx + 'px'; cur.style.top = ny + 'px'; };
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

async function humanMove(page, x, y, steps = 22) {
  await page.mouse.move(x, y, { steps });
}

async function humanClickLocator(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("no bounding box");
  const x = box.x + Math.min(box.width * 0.55, Math.max(4, box.width - 4));
  const y = box.y + box.height * 0.5;
  await humanMove(page, x, y, 26);
  await page.waitForTimeout(220);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.waitForTimeout(350);
}

async function withPage(name, fn) {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
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
      if (r.status !== 0) throw new Error("ffmpeg failed " + name);
      const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", mp4], { encoding: "utf8" });
      console.log(`[${name}] mp4 dur`, probe.stdout.trim());
    }
  }
}

await withPage("01-landing", async (page) => {
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.__setDemoBadge?.("Landing · problem → SeeFix"));
  await humanMove(page, 420, 280, 30);
  await page.waitForTimeout(1400);
  await humanMove(page, 980, 360, 28);
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollBy({ top: 600, behavior: "smooth" }));
  await page.waitForTimeout(1800);
  await humanMove(page, 700, 480, 22);
  await page.waitForTimeout(1600);
  await page.evaluate(() => window.scrollBy({ top: 700, behavior: "smooth" }));
  await page.waitForTimeout(1800);
  await humanMove(page, 560, 520, 20);
  await page.waitForTimeout(1400);
  await page.evaluate(() => window.scrollBy({ top: 500, behavior: "smooth" }));
  await page.waitForTimeout(1600);
  // CTA to lab
  const lab = page.getByRole("link", { name: /lab|try|open/i }).first();
  if (await lab.count()) {
    await page.evaluate(() => window.__setDemoBadge?.("Open the live lab"));
    await humanClickLocator(page, lab);
    await page.waitForTimeout(2500);
  } else {
    await page.goto(BASE + "/lab", { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(2000);
  }
});

await withPage("02-lab-identify", async (page) => {
  await page.goto(BASE + "/lab", { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.__setDemoBadge?.("Lab · Muse Spark identify"));
  await humanMove(page, 640, 300, 24);
  await page.waitForTimeout(1200);
  await page.locator('input[type="file"]').first().setInputFiles(PLATE);
  await page.waitForTimeout(2200);
  await page.evaluate(() => window.__setDemoBadge?.("Model plate uploaded"));
  await humanMove(page, 480, 400, 18);
  await page.waitForTimeout(1000);
  const identifyBtn = page.getByRole("button", { name: /POST \/api\/identify|Identify/i }).first();
  await page.evaluate(() => window.__setDemoBadge?.("POST /api/identify · Baseten"));
  await humanClickLocator(page, identifyBtn);
  await page.waitForFunction(
    () => {
      const txt = Array.from(document.querySelectorAll("pre, code, .font-mono"))
        .map((el) => el.textContent || "").join("\n");
      return /"appliance"/.test(txt) && /"provider"/.test(txt);
    },
    { timeout: 120000 },
  );
  await page.evaluate(() => window.__setDemoBadge?.("Live result · provider baseten"));
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const pre = Array.from(document.querySelectorAll("pre")).find((el) => /"appliance"/.test(el.textContent || ""));
    pre?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
  await page.waitForTimeout(2000);
  await humanMove(page, 880, 480, 24);
  await page.waitForTimeout(2500);
  await humanMove(page, 720, 560, 20);
  await page.waitForTimeout(3500);
  await humanMove(page, 540, 420, 18);
  await page.waitForTimeout(4000);
});

await withPage("03-lab-explore", async (page) => {
  // Re-open lab with plate already identified by uploading again and lingering;
  // also try Safety if available for architecture story.
  await page.goto(BASE + "/lab", { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.locator('input[type="file"]').first().setInputFiles(PLATE);
  await page.waitForTimeout(1200);
  const identifyBtn = page.getByRole("button", { name: /POST \/api\/identify|Identify/i }).first();
  await humanClickLocator(page, identifyBtn);
  await page.waitForFunction(
    () => {
      const txt = Array.from(document.querySelectorAll("pre, code, .font-mono"))
        .map((el) => el.textContent || "").join("\n");
      return /"appliance"/.test(txt) && /"provider"/.test(txt);
    },
    { timeout: 120000 },
  );
  await page.evaluate(() => window.__setDemoBadge?.("Inspect typed JSON · brand / model / confidence"));
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const pre = Array.from(document.querySelectorAll("pre")).find((el) => /"appliance"/.test(el.textContent || ""));
    pre?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
  await page.waitForTimeout(2500);
  // Scroll health / other panels
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await page.waitForTimeout(1500);
  await humanMove(page, 400, 180, 20);
  await page.waitForTimeout(1200);
  // Try Safety button with a short prompt if present
  const safetyBtn = page.getByRole("button", { name: /POST \/api\/safety|Safety/i }).first();
  if (await safetyBtn.count()) {
    await page.evaluate(() => window.__setDemoBadge?.("Safety gate · Muse Glimmer"));
    // look for a textarea near safety
    const ta = page.locator("textarea").first();
    if (await ta.count()) {
      await humanClickLocator(page, ta);
      await ta.fill("");
      const text = "Replace toilet flapper valve under the tank lid.";
      for (const ch of text) {
        await page.keyboard.type(ch, { delay: 35 + Math.random() * 40 });
      }
      await page.waitForTimeout(600);
    }
    await humanClickLocator(page, safetyBtn);
    await page.waitForTimeout(8000); // may succeed or show labeled error
  }
  await page.evaluate(() => window.__setDemoBadge?.("Live lab · seefix.vercel.app/lab"));
  await humanMove(page, 900, 500, 22);
  await page.waitForTimeout(3500);
});

console.log("DONE");
