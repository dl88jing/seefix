import { chromium } from "playwright-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "assets", "cards");
fs.mkdirSync(OUT, { recursive: true });
const cards = {
  title: `<!doctype html><html><head><meta charset=utf-8><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@600;700;800&display=swap');
html,body{margin:0;width:1920px;height:1080px;background:#09090b;color:#fafafa;font-family:Inter,sans-serif}
.wrap{padding:120px 96px}
.k{color:#34d399;letter-spacing:.22em;text-transform:uppercase;font-size:22px;font-weight:600}
h1{font-size:84px;line-height:1.05;letter-spacing:-.035em;margin:28px 0 24px;width:1100px;font-weight:800}
.sub{font-size:32px;color:#a1a1aa;width:900px;line-height:1.4;font-weight:500}
.badge{position:fixed;left:96px;bottom:64px;color:#71717a;font-size:22px}
</style></head><body><div class=wrap>
<div class=k>HOOK</div>
<h1>2 AM. The toilet<br>won't stop running.</h1>
<p class=sub>Avery needs the right part — and proof the repair is safe.</p>
<div class=badge>SeeFix · Meta Global AI · LIVE</div>
</div></body></html>`,
  arch: `<!doctype html><html><head><meta charset=utf-8><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@600;700;800&family=JetBrains+Mono:wght@500&display=swap');
html,body{margin:0;width:1920px;height:1080px;background:#09090b;color:#fafafa;font-family:Inter,sans-serif}
.wrap{padding:100px 96px;display:flex;gap:48px}
.left{flex:1}
.k{color:#34d399;letter-spacing:.22em;text-transform:uppercase;font-size:22px;font-weight:600}
h1{font-size:68px;line-height:1.05;letter-spacing:-.03em;margin:24px 0 18px;width:820px;font-weight:800}
.sub{font-size:28px;color:#a1a1aa;width:780px;line-height:1.35}
.arch{width:860px;display:grid;gap:16px}
.card{border-radius:16px;border:1px solid #27272a;background:linear-gradient(180deg,#18181b,#0c0c0e);padding:22px 26px}
.t{font-family:JetBrains Mono,monospace;font-size:18px;color:#34d399}
.h{font-size:30px;font-weight:700;margin-top:6px}
.d{font-size:22px;color:#a1a1aa;margin-top:8px;line-height:1.35}
.badge{position:fixed;left:96px;bottom:64px;color:#71717a;font-size:22px}
</style></head><body><div class=wrap>
<div class=left>
<div class=k>ARCHITECTURE</div>
<h1>Spark · Glimmer ·<br>rate limits.</h1>
<p class=sub>Baseten inference · Modal safety gate · fail-closed quotas.</p>
</div>
<div class=arch>
<div class=card><div class=t>/api/identify</div><div class=h>Muse Spark Open</div><div class=d>Vision → typed JSON on Baseten</div></div>
<div class=card><div class=t>/api/safety</div><div class=h>Muse Glimmer · Modal</div><div class=d>Stops gas, mains, scald risk</div></div>
<div class=card><div class=t>quota</div><div class=h>Rate limits</div><div class=d>20/hr IP · 200/day · fail-closed</div></div>
</div>
</div><div class=badge>SeeFix · Green Robin Labs</div></body></html>`,
  outro: `<!doctype html><html><head><meta charset=utf-8><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@600;700;800&family=JetBrains+Mono:wght@500&display=swap');
html,body{margin:0;width:1920px;height:1080px;background:#09090b;color:#fafafa;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;text-align:center}
.k{color:#34d399;letter-spacing:.22em;text-transform:uppercase;font-size:22px;font-weight:600;margin-bottom:18px}
h1{font-size:110px;margin:0 0 12px;letter-spacing:-.03em;font-weight:800}
.tag{font-size:34px;color:#a1a1aa;margin-bottom:28px}
.urls{font-family:JetBrains Mono,monospace;font-size:28px;color:#34d399;line-height:1.7}
.credit{margin-top:36px;font-size:20px;color:#71717a;letter-spacing:.08em;text-transform:uppercase}
</style></head><body><div>
<div class=k>TRY IT</div>
<h1>SeeFix</h1>
<div class=tag>It sees the part. It checks your work.</div>
<div class=urls>seefix.vercel.app<br>github.com/dl88jing/seefix</div>
<div class=credit>Green Robin Labs · Meta Global AI Developer Hackathon</div>
</div></body></html>`,
};
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const [name, html] of Object.entries(cards)) {
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const dest = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: dest, fullPage: false });
  console.log("wrote", dest);
}
await browser.close();
