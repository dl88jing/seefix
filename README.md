# SeeFix by Northbridge

> **It sees the part. It checks your work.**

SeeFix is a camera-first repair copilot. Point a phone at a broken fixture and SeeFix reads the model plate, finds the exact part you need to touch, shows the next step drawn on *your own photo*, stops you when a step is unsafe, and verifies the fix before you call it done.

Hero demo: **replacing a worn toilet flapper**. Avery (first-time renter) has a toilet that runs all night; Morgan (weekend fixer) wants proof the part matches and the job was done right.

**Live app:** https://seefix.vercel.app · **Model test bench:** https://seefix.vercel.app/lab

Built by team **Northbridge** for the Meta AI Developer Hackathon (Indie track).

---

## Built during the hackathon

**All code in this repository was written during the Meta AI Developer Hackathon build window, starting Oct 26, 2026.** The commit history starts on Oct 26, 2026; nothing was ported from an earlier project.

Original work by Northbridge (everything under `src/` and `modal/`):

- The Meta Model API integration layer (`src/lib/*`): request shaping for Muse Spark structured output, SAM 3.1 streaming segmentation, Muse Image edits, input validation and the "no mock data" 503 contract.
- API routes `/api/identify`, `/api/segment`, `/api/card`, `/api/safety`, `/api/health`.
- The `/lab` test bench (client-side SAM mask rendering on canvas) and the landing page.
- The Modal deployment of Muse Glimmer as a self-hosted safety gate (`modal/glimmer_gate.py`).

Open-source dependencies used (not our work):

| Dependency | Use | License |
|---|---|---|
| [Next.js](https://nextjs.org) 15, React 19 | App framework | MIT |
| [Tailwind CSS](https://tailwindcss.com) 4 | Styling | MIT |
| [openai](https://github.com/openai/openai-node) (Node SDK) | Client for the OpenAI-compatible Meta Model API | Apache-2.0 |
| [zod](https://zod.dev) | Runtime validation of model output | MIT |
| [@meta-sam/parser](https://www.npmjs.com/package/@meta-sam/parser) | Parses SAM 3.1 token output and decodes masks | SAM License |
| [vLLM](https://github.com/vllm-project/vllm) (`vllm/vllm-openai:muse-glimmer` image) | Serves Muse Glimmer | Apache-2.0 |
| [Modal](https://modal.com) Python SDK | GPU hosting for the Glimmer gate | Apache-2.0 |
| [Muse Glimmer 30B](https://huggingface.co/meta-models/Muse-Glimmer-30B) weights | Open-weights safety model | Apache-2.0 |
| ESLint, TypeScript, Geist font | Tooling / typography | MIT / Apache-2.0 / OFL |

Meta Model API models used: `muse-spark-1.3`, `sam-3.1`, `muse-image-1.0` (and, planned, realtime speech-to-text).

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
 │ /api/identify  model plate ─► Muse Spark (vision, JSON-schema output)      │
 │ /api/plan      appliance + symptom ─► Muse Spark repair plan               │
 │ /api/segment   frame + noun phrase ─► SAM 3.1 boxes + masks                │
 │ /api/verify    after-clip ─► SAM 3.1 + Muse Spark "is it fixed?"           │
 │ /api/safety    frame + planned step ─► Muse Glimmer (vLLM on Modal)        │
 │ /api/card      frame + instruction ─► Muse Image edit (annotated card)     │
 │ /api/recap     session ─► shareable repair recap                           │
 └───────────────────────────────────────────────────────────────────────────┘
                 │
                 ▼
 Data: Neon Postgres (Drizzle) · Vercel Blob (clips, cards) · Upstash (rate limit) · /evals
```

**Status (day one):** `/api/identify`, `/api/segment`, `/api/card`, `/api/safety` and `/api/health` are implemented and exercised from `/lab`. `/api/plan`, `/api/verify`, `/api/asr`, `/api/recap`, the live camera loop and the data layer are next.

### Routes

| Route | Input | Model | Output |
|---|---|---|---|
| `POST /api/identify` | `image` | `muse-spark-1.3` via Chat Completions + `response_format: json_schema` (strict) | `{ appliance: { brand, model, serial, appliance_family, confidence } }` (zod-validated) |
| `POST /api/segment` | `image`, `phrase` (short noun phrase, e.g. `toilet flapper`) | `sam-3.1` via Responses API, streaming, `mask_encoding=one_bit` | `{ objects: [{ id, box, confidence, mask }] }`; decode masks with `decodeMaskToRaster` |
| `POST /api/card` | `image`, `instruction` | `muse-image-1.0` via `/v1/images/edits` | `{ image: "data:image/png;base64,..." }` |
| `POST /api/safety` | `image`, `step` | Muse Glimmer 30B on Modal (OpenAI-compatible vLLM) | `{ hazard, severity, reason }` (zod-validated) |
| `GET /api/health` | none | none | which env vars are configured (booleans only) |

Images can be sent as `multipart/form-data` (field `image`) or JSON (`{"image": "data:image/jpeg;base64,..."}` plus text fields). Max 8 MB; `/lab` downsizes to 1600 px before upload.

**No mock data, ever.** If a route's env var is missing it returns HTTP 503 with `{"error":"not_configured","missing_env":"META_API_KEY"}` (or `GLIMMER_URL`). Upstream failures return the upstream status and message.

---

## Setup

```bash
git clone https://github.com/dl88jing/seefix && cd seefix
npm install
cp .env.example .env.local   # fill in values; .env.local is gitignored
npm run dev                  # http://localhost:3000 and /lab
```

### Environment variables

| Variable | Required for | Notes |
|---|---|---|
| `META_API_KEY` | `/api/identify`, `/api/segment`, `/api/card` | Meta Model API key from dev.meta.ai. `MODEL_API_KEY` (the name in Meta's docs) is accepted as a fallback. |
| `GLIMMER_URL` | `/api/safety` | Base URL of the Modal web endpoint (no trailing `/v1`). |
| `GLIMMER_API_KEY` | `/api/safety` (when the gate is locked) | Must match `GLIMMER_API_KEY` in the Modal secret `seefix-glimmer`. |
| `GLIMMER_QUOTA_URL` | `/api/safety` | Web URL of the `quota` function (rate limiter) in the same Modal app. Without it the safety gate stays closed. |
| `META_BASE_URL` | optional | Defaults to `https://api.meta.ai/v1`. |
| `META_SPARK_MODEL`, `META_SAM_MODEL`, `META_IMAGE_MODEL`, `GLIMMER_MODEL` | optional | Override model ids (defaults: `muse-spark-1.3`, `sam-3.1`, `muse-image-1.0`, `muse-glimmer`). |

### Muse Glimmer safety gate on Modal

Weights: [`meta-models/Muse-Glimmer-30B`](https://huggingface.co/meta-models/Muse-Glimmer-30B) (public, Apache-2.0, no HF token needed). bf16 serving needs about 72 GB of VRAM, so the gate runs on one H100 80GB and scales to zero when idle.

```bash
pip install modal && modal setup
modal secret create seefix-glimmer GLIMMER_API_KEY=<random-long-string>
modal run modal/glimmer_gate.py::download_weights   # CPU-only, fills the HF cache volume (~60 GB)
modal deploy modal/glimmer_gate.py                  # prints the web endpoint URL
```

Then set `GLIMMER_URL` (the printed `serve` URL), `GLIMMER_QUOTA_URL` (the printed `quota` URL) and `GLIMMER_API_KEY` on Vercel.

**Rate limits on the public safety gate.** `/api/safety` is metered before the GPU is touched: 10 requests per hour per IP (sliding window) and 100 requests per UTC day for the whole site, enforced by the `quota` Modal function (one CPU container, scale-to-zero, counters in the Modal Dict `seefix-glimmer-quota`, IPs HMAC-hashed). Each Vercel instance also pre-checks the per-IP window in memory. Over the limit returns HTTP 429 with `Retry-After`; if the limiter is unreachable the gate fails closed (503). Override with `SAFETY_PER_IP_PER_HOUR` / `SAFETY_GLOBAL_PER_DAY` at `modal deploy` time.

**Meta API not yet active.** If the Meta account has no billing yet, Meta returns HTTP 402 `billing_error` / `billing_not_configured`. The Meta routes turn that into HTTP 503 `{"error":"meta_api_not_active"}` and `/lab` shows a "Meta API not yet active" notice instead of a raw error.

Day-one status: the gate is deployed on Modal (H100, scale-to-zero, max one container) and answers `/v1/models` and chat requests; a cold start with cached weights takes about 2.5 minutes. The `vllm/vllm-openai:muse-glimmer` build does not enforce `response_format` JSON schemas for Glimmer, so `/api/safety` asks for the JSON shape in the prompt, extracts the object and validates it with zod (a missing `hazard` is derived from `severity` and reported in a `normalized` field).

### Deploy the app

```bash
vercel --prod
vercel env add META_API_KEY production
```

---

## License

MIT for the code in this repository (see `LICENSE`). Model weights and third-party packages keep their own licenses.
