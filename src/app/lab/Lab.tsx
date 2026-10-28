"use client";

import { decodeMaskToRaster, type SegmentationMask } from "@meta-sam/parser";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Box = { left: number; top: number; right: number; bottom: number };
type SegObject = {
  id: string;
  box: Box;
  confidence: number | null;
  mask: (SegmentationMask & { bounds: Box }) | null;
};
type Result = { status: number; ms: number; body: unknown } | null;

const COLORS = ["#34d399", "#60a5fa", "#f472b6", "#fbbf24", "#a78bfa", "#f87171"];
const MAX_SIDE = 1600;

/** Downscale to keep uploads under serverless body limits; returns a JPEG data URL. */
async function prepareImage(file: File): Promise<{ dataUrl: string; w: number; h: number }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  return { dataUrl: c.toDataURL("image/jpeg", 0.9), w, h };
}

async function post(path: string, body: Record<string, string>): Promise<Result> {
  const t0 = performance.now();
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { status: res.status, ms: Math.round(performance.now() - t0), body: parsed };
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Friendly banner for known, expected states (Meta billing not active yet, rate limits). */
function Notice({ result }: { result: Result }) {
  const b = (result?.body ?? null) as { error?: string; title?: string; message?: string } | null;
  if (!b || typeof b !== "object") return null;
  if (b.error === "meta_api_not_active") {
    return (
      <div role="status" className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
        <p className="font-medium">Meta API not yet active</p>
        <p className="mt-1 text-amber-200/80">
          This deployment&apos;s Meta Model API account is still being activated (hackathon credits can take up to 2
          business days). The route is wired up and will start returning real results automatically. Nothing here is mocked.
        </p>
      </div>
    );
  }
  if (b.error === "rate_limited" || b.error === "rate_limiter_unavailable") {
    return (
      <div role="status" className="mt-3 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-sm text-sky-200">
        <p className="font-medium">{b.title ?? "Safety gate temporarily unavailable"}</p>
        <p className="mt-1 text-sky-200/80">{b.message}</p>
      </div>
    );
  }
  return null;
}

function JsonPane({ title, result, busy }: { title: string; result: Result; busy: boolean }) {
  return (
    <div className="mt-3">
      <Notice result={result} />
      <p className="text-xs text-zinc-500">
        {title}
        {busy ? " · running…" : result ? ` · HTTP ${result.status} · ${result.ms} ms` : ""}
      </p>
      <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-black/60 p-3 text-xs text-zinc-300">
        {result ? JSON.stringify(result.body, (k, v) => (k === "payload" || k === "image") && typeof v === "string" && v.length > 120 ? `${v.slice(0, 60)}… (${v.length} chars)` : v, 2) : "—"}
      </pre>
    </div>
  );
}

export default function Lab() {
  const [img, setImg] = useState<{ dataUrl: string; w: number; h: number } | null>(null);
  const [phrase, setPhrase] = useState("toilet flapper");
  const [instruction, setInstruction] = useState("Label the flapper and the chain. Show the chain clipped with about 1/2 inch of slack.");
  const [step, setStep] = useState("Turn off the water supply valve and flush to drain the tank before removing the flapper.");
  const [results, setResults] = useState<Record<string, Result>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [health, setHealth] = useState<Record<string, boolean | string | null> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => setHealth(j.configured))
      .catch(() => setHealth(null));
  }, []);

  const run = useCallback(
    async (key: string, path: string, extra: Record<string, string>) => {
      if (!img) return;
      setBusy((b) => ({ ...b, [key]: true }));
      try {
        const r = await post(path, { image: img.dataUrl, ...extra });
        setResults((s) => ({ ...s, [key]: r }));
      } catch (e) {
        setResults((s) => ({ ...s, [key]: { status: 0, ms: 0, body: { error: String(e) } } }));
      } finally {
        setBusy((b) => ({ ...b, [key]: false }));
      }
    },
    [img],
  );

  // Draw image + SAM boxes/masks.
  const seg = results.segment;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d")!;
    const base = new Image();
    base.onload = () => {
      canvas.width = img.w;
      canvas.height = img.h;
      ctx.drawImage(base, 0, 0, img.w, img.h);
      const body = seg?.body as { objects?: SegObject[] } | undefined;
      const objects = seg && seg.status === 200 ? (body?.objects ?? []) : [];
      objects.forEach((o, i) => {
        const color = COLORS[i % COLORS.length];
        if (o.mask) {
          try {
            const raster = decodeMaskToRaster(o.mask);
            const { width: mw, height: mh, bounds } = o.mask;
            const off = document.createElement("canvas");
            off.width = mw;
            off.height = mh;
            const octx = off.getContext("2d")!;
            const id = octx.createImageData(mw, mh);
            const [r, g, b] = hexToRgb(color);
            for (let p = 0; p < raster.length; p++) {
              if (raster[p]) {
                id.data[p * 4] = r;
                id.data[p * 4 + 1] = g;
                id.data[p * 4 + 2] = b;
                id.data[p * 4 + 3] = 110;
              }
            }
            octx.putImageData(id, 0, 0);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(off, bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
          } catch (e) {
            console.warn("mask decode failed", e);
          }
        }
        const { left, top, right, bottom } = o.box;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, img.w / 400);
        ctx.strokeRect(left, top, right - left, bottom - top);
        const label = `${o.id}${o.confidence != null ? ` ${(o.confidence * 100).toFixed(0)}%` : ""}`;
        ctx.font = `${Math.max(14, img.w / 60)}px ui-monospace, monospace`;
        const tw = ctx.measureText(label).width + 8;
        ctx.fillStyle = color;
        ctx.fillRect(left, Math.max(0, top - 22), tw, 22);
        ctx.fillStyle = "#09090b";
        ctx.fillText(label, left + 4, Math.max(16, top - 6));
      });
    };
    base.src = img.dataUrl;
  }, [img, seg]);

  const card = results.card;
  const cardImage = card && card.status === 200 ? (card.body as { image?: string }).image : undefined;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold">SeeFix Lab</h1>
        <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← SeeFix by Northbridge
        </Link>
      </div>
      <p className="mt-2 text-zinc-400">
        Test bench for each model route. Responses are shown raw; a 503 means the deployment is missing the named env var
        (nothing here is mocked).
      </p>
      {health && (
        <p className="mt-2 font-mono text-xs text-zinc-500">
          {Object.entries(health)
            .map(([k, v]) =>
              typeof v === "boolean" ? `${k}: ${v ? "set" : "missing"}` : `${k}: ${v ?? "none"}`,
            )
            .join("  ·  ")}
        </p>
      )}

      <section className="mt-6 rounded-xl border border-zinc-800 p-5">
        <label className="block text-sm font-medium">1. Photo</label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="mt-2 block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-zinc-100"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setResults({});
            setImg(await prepareImage(f));
          }}
        />
        {img && <p className="mt-2 text-xs text-zinc-500">Prepared {img.w}×{img.h} JPEG for upload.</p>}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-800 p-5">
          <h2 className="font-medium">Identify · Muse Spark Open (Baseten)</h2>
          <p className="text-sm text-zinc-400">Upload a model-plate photo. Rate-limited; uses Baseten when configured.</p>
          <button disabled={!img || busy.identify} onClick={() => run("identify", "/api/identify", {})} className="mt-3 rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40">
            POST /api/identify
          </button>
          <JsonPane title="response" result={results.identify ?? null} busy={!!busy.identify} />
        </section>

        <section className="rounded-xl border border-zinc-800 p-5">
          <h2 className="font-medium">Safety gate · Muse Glimmer (Modal)</h2>
          <input value={step} onChange={(e) => setStep(e.target.value)} className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" placeholder="planned step" />
          <button disabled={!img || busy.safety} onClick={() => run("safety", "/api/safety", { step })} className="mt-3 rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40">
            POST /api/safety
          </button>
          <JsonPane title="response" result={results.safety ?? null} busy={!!busy.safety} />
        </section>

        <section className="rounded-xl border border-zinc-800 p-5">
          <h2 className="font-medium">Segment · SAM 3.1</h2>
          <input value={phrase} onChange={(e) => setPhrase(e.target.value)} className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" placeholder="short noun phrase" />
          <button disabled={!img || busy.segment || !phrase.trim()} onClick={() => run("segment", "/api/segment", { phrase })} className="mt-3 rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40">
            POST /api/segment
          </button>
          <canvas ref={canvasRef} className="mt-3 w-full rounded-lg bg-black/40" />
          <JsonPane title="response" result={results.segment ?? null} busy={!!busy.segment} />
        </section>

        <section className="rounded-xl border border-zinc-800 p-5">
          <h2 className="font-medium">Instruction card · Muse Image edit</h2>
          <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3} className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" />
          <button disabled={!img || busy.card || !instruction.trim()} onClick={() => run("card", "/api/card", { instruction })} className="mt-3 rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40">
            POST /api/card
          </button>
          {cardImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cardImage} alt="Edited instruction card" className="mt-3 w-full rounded-lg" />
          )}
          <JsonPane title="response" result={results.card ?? null} busy={!!busy.card} />
        </section>
      </div>
    </main>
  );
}
