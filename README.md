# SeeFix

> **It sees the part. It checks your work.**

SeeFix is a camera-first repair copilot. Point a phone at a broken fixture and SeeFix reads the model plate, finds the exact part you need to touch, shows the next step drawn on *your own photo*, stops you when a step is unsafe, and verifies the fix before you call it done.

Hero demo: **replacing a worn toilet flapper**. Avery (first-time renter) has a toilet that runs all night; Morgan (weekend fixer) wants proof the part matches and the job was done right.

**Live app:** https://seefix.vercel.app · **Model test bench:** https://seefix.vercel.app/lab


## Demo video

Simulated-user Playwright screen recording of the live app (Muse Spark Open identify via Baseten on `/lab`), narrated with HyperFrames + Kokoro. Screen footage is ~75% of runtime.

[![SeeFix demo](https://img.youtube.com/vi/Mk7XkNJ0lXE/maxresdefault.jpg)](https://youtu.be/Mk7XkNJ0lXE)

- **YouTube:** https://youtu.be/Mk7XkNJ0lXE
- **MP4 (fallback):** [seefix-demo-v2.mp4](https://github.com/dl88jing/seefix/releases/download/v0.2.0/seefix-demo-v2.mp4) (~112s · also [`video/renders/seefix-demo-v2.mp4`](video/renders/seefix-demo-v2.mp4))
- **Poster:** [`video/renders/seefix-demo-poster.png`](video/renders/seefix-demo-poster.png)
- **Live app:** https://seefix.vercel.app · **Lab:** https://seefix.vercel.app/lab


Built by **Green Robin Labs** for the Meta Global AI Developer Hackathon (Indie track).

---

## Built during the hackathon

**All code in this repository was written during the Meta AI Developer Hackathon build window, starting Oct 26, 2026.** The commit history starts on Oct 26, 2026; nothing was ported from an earlier project.

Original work by Green Robin Labs (everything under `src/` and `modal/`):

- The inference integration layer (`src/lib/*`): Muse Spark Open via Baseten (preferred) with Meta Model API fallback for Spark structured output, SAM 3.1 streaming segmentation, Muse Image edits, input validation and the "no mock data" 503 contract.
- API routes `/api/identify`, `/api/segment`, `/api/card`, `/api/safety`, `/api/health`.
- The `/lab` test bench (client-side SAM mask rendering on canvas) and the landing page.
- The Modal deployment of Muse Glimmer as a self-hosted safety gate (`modal/glimmer_gate.py`).

Open-source dependencies used (not our work):

| Dependency | Use | License |
|---|---|---|
| [Next.js](https://nextjs.org) 15, React 19 | App framework | MIT |
| [Tailwind CSS](https://tailwindcss.com) 4 | Styling | MIT |
| [openai](https://github.com/openai/openai-node) (Node SDK) | Client for OpenAI-compatible Muse Spark (Baseten) and Meta Model API | Apache-2.0 |
| [zod](https://zod.dev) | Runtime validation of model output | MIT |
| [@meta-sam/parser](https://www.npmjs.com/package/@meta-sam/parser) | Parses SAM 3.1 token output and decodes masks | SAM License |
| [vLLM](https://github.com/vllm-project/vllm) (`vllm/vllm-openai:muse-glimmer` image) | Serves Muse Glimmer | Apache-2.0 |
| [Modal](https://modal.com) Python SDK | GPU hosting for the Glimmer gate | Apache-2.0 |
| [Muse Glimmer 30B](https://huggingface.co/meta-models/Muse-Glimmer-30B) weights | Open-weights safety model | Apache-2.0 |
| ESLint, TypeScript, Geist font | Tooling / typography | MIT / Apache-2.0 / OFL |

Models used: `meta-models/muse-spark-open-1026` (Muse Spark Open via Baseten), plus Meta Model API `sam-3.1` / `muse-image-1.0` when that key is active (and, planned, realtime speech-to-text).

---

## Architecture

```
 Phone / laptop browser
 ┌──────────────────────────────────────────────────────────────────────┐
 │ getUserMedia camera ──► keyframe sampler (2 fps) ──► /api/segment     │
 │ mic ─────────────────► /api/asr (realtime speech-to-text)             │
 │ "done" ──► 8 s clip ──► Vercel Blob ──► /api/verify                   │
 └──────────────────────────────────────────────────────────────────────┘
                 │
                 ▼  Next.js 15 on Vercel (Node runtime)
 ┌───────────────────────────────────────────────────────────────────────────┐
 │ /api/identify  model plate ─► Muse Spark Open via Baseten (vision, JSON)   │
 │ /api/plan      appliance + symptom ─► Muse Spark Open repair plan          │
 │ /api/segment   frame + noun phrase ─► SAM 3.1 boxes + masks                │
 │ /api/verify    after-clip ─► SAM 3.1 + Muse Spark Open "is it fixed?"      │
 │ /api/safety    frame + planned step ─► Muse Glimmer (vLLM on Modal)        │
 │ /api/card      frame + instruction ─► Muse Image edit (annotated card)     │
 │ /api/recap     session ─► shareable repair recap                           │
 └───────────────────────────────────────────────────────────────────────────┘
                 │
                 ▼
 Data: Neon Postgres (Drizzle) · Vercel Blob (clips, cards) · Upstash (rate limit) · /evals
```

**Status (measured Sat Oct 31, 2026 ~10:30 PM PT against https://seefix.vercel.app):** `/api/identify`, `/api/segment`, `/api/card`, `/api/safety` and `/api/health` are live and called real models from `/lab` (no mocks). Identify uses Muse Spark Open on Baseten; SAM 3.1 + Muse Image hit the Meta Model API; safety uses Muse Glimmer on Modal (fail-closed rate limits). `/api/plan`, `/api/verify`, `/api/asr`, `/api/recap`, the continuous camera loop and the data layer are next.

| Route | Measured | Notes |
|---|---|---|
| `GET /api/health` | HTTP 200 | All keys configured; `spark_provider: baseten` |
| `POST /api/identify` | HTTP 200 · ~9.3 s | `provider: baseten`, model `meta-models/muse-spark-open-1026` |
| `POST /api/segment` | HTTP 200 · ~1.9 s | Meta `sam-3.1` (empty `objects` on a plate-only photo is expected) |
| `POST /api/card` | HTTP 200 · ~20 s | Meta `muse-image-1.0` edit |
| `POST /api/safety` | HTTP 200 · ~182 s cold | Modal Glimmer; warm calls are much faster |

**Honest fallbacks (never mocked):** missing env → HTTP 503 `not_configured` naming the var; Meta billing not active → HTTP 503 `meta_api_not_active` (Lab shows an amber banner); rate limit / unreachable quota on Vercel → 429 / 503 fail-closed.

### Routes

| Route | Input | Model | Output |
|---|---|---|---|
| `POST /api/identify` | `image` | Muse Spark Open (`meta-models/muse-spark-open-1026`) via Baseten Chat Completions + `response_format: json_schema` (strict); Meta `muse-spark-1.3` fallback | `{ appliance: { brand, model, serial, appliance_family, confidence }, provider }` (zod-validated) |
| `POST /api/segment` | `image`, `phrase` (short noun phrase, e.g. `toilet flapper`) | `sam-3.1` via Responses API, streaming, `mask_encoding=one_bit` | `{ objects: [{ id, box, confidence, mask }] }`; decode masks with `decodeMaskToRaster` |
| `POST /api/card` | `image`, `instruction` | `muse-image-1.0` via `/v1/images/edits` | `{ image: "data:image/png;base64,..." }` |
| `POST /api/safety` | `image`, `step` | Muse Glimmer 30B on Modal (OpenAI-compatible vLLM) | `{ hazard, severity, reason }` (zod-validated) |
| `GET /api/health` | none | none | which env vars are configured (booleans only) |

Images can be sent as `multipart/form-data` (field `image`) or JSON (`{"image": "data:image/jpeg;base64,..."}` plus text fields). Max 8 MB; `/lab` downsizes to 1600 px before upload.

**No mock data, ever.** If a route's env var is missing it returns HTTP 503 with `{"error":"not_configured","missing_env":"BASETEN_API_KEY"}` (or `META_API_KEY` / `GLIMMER_URL`). Upstream failures return the upstream status and message. API keys stay server-side only.

---

## Setup

```bash
git clone https://github.com/dl88jing/seefix && cd seefix
npm ci
cp .env.example .env.local   # fill in values; .env.local is gitignored
npm test                     # 19 unit tests, no API keys
npm run dev                  # http://localhost:3000 and /lab
./demo.sh                    # live health + tests; LIVE=1 to hit /api/identify
```

### Environment variables

| Variable | Required for | Notes |
|---|---|---|
| `BASETEN_API_KEY` | `/api/identify` (preferred) | Baseten key for Meta Muse Spark Open. Prefer this when set. |
| `BASETEN_BASE_URL` | optional | Defaults to `https://inference.baseten.co/v1`. |
| `BASETEN_MODEL` | optional | Defaults to `meta-models/muse-spark-open-1026` (required model id on Baseten). |
| `META_API_KEY` | `/api/segment`, `/api/card`; Spark fallback | Meta Model API key from dev.meta.ai. `MODEL_API_KEY` is accepted as a fallback. Used for Spark only when `BASETEN_API_KEY` is unset. |
| `GLIMMER_URL` | `/api/safety` | Base URL of the Modal web endpoint (no trailing `/v1`). |
| `GLIMMER_API_KEY` | `/api/safety` (when the gate is locked); shared quota auth | Must match `GLIMMER_API_KEY` in the Modal secret `seefix-glimmer`. |
| `GLIMMER_QUOTA_URL` | `/api/safety`, `/api/identify` (on Vercel) | Web URL of the `quota` function (rate limiter) in the same Modal app. Without it those routes stay closed in production. |
| `META_BASE_URL` | optional | Defaults to `https://api.meta.ai/v1`. |
| `META_SPARK_MODEL`, `META_SAM_MODEL`, `META_IMAGE_MODEL`, `GLIMMER_MODEL` | optional | Override model ids when not on Baseten (defaults: `muse-spark-1.3`, `sam-3.1`, `muse-image-1.0`, `muse-glimmer`). |
| `SPARK_PER_IP_PER_HOUR`, `SPARK_GLOBAL_PER_DAY` | optional | Identify rate limits (defaults: 20 / hour / IP, 200 / UTC day). |
| `SAFETY_PER_IP_PER_HOUR`, `SAFETY_GLOBAL_PER_DAY` | optional | Safety gate rate limits (defaults: 10 / hour / IP, 100 / UTC day). |

### Muse Glimmer safety gate on Modal

Weights: [`meta-models/Muse-Glimmer-30B`](https://huggingface.co/meta-models/Muse-Glimmer-30B) (public, Apache-2.0, no HF token needed). bf16 serving needs about 72 GB of VRAM, so the gate runs on one H100 80GB and scales to zero when idle.

```bash
pip install modal && modal setup
modal secret create seefix-glimmer GLIMMER_API_KEY=<random-long-string>
modal run modal/glimmer_gate.py::download_weights   # CPU-only, fills the HF cache volume (~60 GB)
modal deploy modal/glimmer_gate.py                  # prints the web endpoint URL
```

Then set `GLIMMER_URL` (the printed `serve` URL), `GLIMMER_QUOTA_URL` (the printed `quota` URL) and `GLIMMER_API_KEY` on Vercel.

**Rate limits (before any paid call).** `/api/safety` and `/api/identify` are metered before Baseten, Meta, or the Glimmer GPU is touched. The `quota` Modal function (one CPU container, scale-to-zero, counters in the Modal Dict `seefix-glimmer-quota`, IPs HMAC-hashed) enforces separate buckets:

| Bucket | Route | Per IP / hour | Global / UTC day |
|---|---|---|---|
| `spark` | `/api/identify` | 20 | 200 |
| `safety` | `/api/safety` | 10 | 100 |

Each Vercel instance also pre-checks the per-IP window in memory. Over the limit returns HTTP 429 with `Retry-After`; on Vercel, if the limiter is unreachable the route fails closed (503). Override with `SPARK_*` / `SAFETY_*` at `modal deploy` time (and matching Vercel env if you mirror them).

**Muse Spark Open via Baseten.** `/api/identify` prefers `BASETEN_API_KEY` and calls `meta-models/muse-spark-open-1026` on `https://inference.baseten.co/v1` (OpenAI-compatible). Spark Open is a reasoning model (`reasoning_content` plus final `content`); the route uses generous `max_tokens` and treats empty `content` as a 502 rather than inventing a result. If Baseten is unset, it falls back to the Meta Model API Spark id.

**Meta billing fallback.** As of the Oct 31 PT probe, Meta-backed `/api/segment` and `/api/card` return real results. If Meta ever returns HTTP 402 `billing_error` / `billing_not_configured`, those routes (and Spark when falling back to Meta) map it to HTTP 503 `{"error":"meta_api_not_active"}` and `/lab` shows an amber "Meta API not yet active" banner — never a mocked mask or image.

Status: the gate is deployed on Modal (H100, scale-to-zero, max one container) and answers `/v1/models` and chat requests; a cold start with cached weights takes about 2.5 minutes. The `vllm/vllm-openai:muse-glimmer` build does not enforce `response_format` JSON schemas for Glimmer, so `/api/safety` asks for the JSON shape in the prompt, extracts the object and validates it with zod (a missing `hazard` is derived from `severity` and reported in a `normalized` field).

### Deploy the app

```bash
vercel env add BASETEN_API_KEY production
vercel env add BASETEN_BASE_URL production
vercel env add BASETEN_MODEL production
# Also keep GLIMMER_* and META_API_KEY (for SAM / Muse Image) on production.
vercel --prod
```

---



## For judges (verifiable in under 2 minutes)

**Track:** Indie Developer · **Theme:** Build for Your World · **Affiliation:** Green Robin Labs

| What | Link |
|---|---|
| Live app | https://seefix.vercel.app |
| Model lab | https://seefix.vercel.app/lab |
| Demo video | https://youtu.be/Mk7XkNJ0lXE · [MP4](https://github.com/dl88jing/seefix/releases/download/v0.2.0/seefix-demo-v2.mp4) |
| Source | https://github.com/dl88jing/seefix |

```bash
# 1) Health — booleans only (never secrets)
curl -sS https://seefix.vercel.app/api/health | python3 -m json.tool
# Expect: ok true, spark_provider "baseten", BASETEN_API_KEY/META_API_KEY/GLIMMER_* true

# 2) One-command demo (health + unit tests; no keys needed locally)
git clone https://github.com/dl88jing/seefix && cd seefix && npm ci && ./demo.sh

# 3) Optional live identify against the public deploy (counts toward rate limits)
LIVE=1 ./demo.sh
```

In `/lab`, upload any fixture photo (or `video/assets/sample-plate.jpg`) and click **Identify**, **Segment**, **Card**, and **Safety**. Identify should show `provider: "baseten"`. If a Meta route is billing-blocked you will see a labeled 503 banner, not fake JSON.

**Sponsor-stack honesty (what we actually call):**
- Muse Spark Open (`meta-models/muse-spark-open-1026`) via **Baseten** — live identify
- **SAM 3.1** + **Muse Image 1.0** via **Meta Model API** — live segment + card
- **Muse Glimmer 30B** open weights on **Modal** (vLLM) — live safety gate
- We do **not** claim Fireworks or Muse Wonder in the running paths

**Bonus prizes we can honestly sit in:** Best Build on Open Weight Models (Spark Open + Glimmer); Best Creative Build (Muse Image cards). Agentic / viral / community-vote bonuses need the continuous verify loop or an X post — not claimed here.

Architecture diagram: see ASCII above and [`docs/architecture.md`](docs/architecture.md).

---
## Hackathon submission package

Paste-ready Cerebral Valley field copy, cover, gallery, and pitch deck:

| Asset | Path |
|---|---|
| Field copy | [`submission.md`](submission.md) |
| Cover | [`submission/cover.png`](submission/cover.png) |
| Gallery (5) | [`submission/gallery/`](submission/gallery/) |
| Pitch deck (PDF) | [`submission/deck/seefix-pitch.pdf`](submission/deck/seefix-pitch.pdf) |
| Demo video | https://youtu.be/Mk7XkNJ0lXE (~112s) · [MP4](https://github.com/dl88jing/seefix/releases/download/v0.2.0/seefix-demo-v2.mp4) |

Submit at [Cerebral Valley](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit) before **Wed Nov 4, 2026 9:00 PM ET** (= **6:00 PM PT** after DST ends Nov 1; PT is UTC-8). Affiliation: **Green Robin Labs**. Demo: https://youtu.be/Mk7XkNJ0lXE

---

## License

MIT for the code in this repository (see `LICENSE`). Model weights and third-party packages keep their own licenses.
