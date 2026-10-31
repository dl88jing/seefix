# SeeFix — Meta Global AI Developer Hackathon Submission

**Portal:** https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit  
**Deadline:** Wed Nov 4, 2026, 9:00 PM ET (6:00 PM PT / America/Los_Angeles)  
**Status:** Package ready — paste into CV form after login. Exact field labels behind login wall; copy below covers confirmed + CV-pattern fields.

**Sources used for requirements**
- Gmail (`dl88jing@gmail.com`): APPROVED Oct 20; Oct 26 host blasts (kickoff, Discord, $150 credits form). No separate Official Rules email body in inbox.
- Event page / markdown: https://cerebralvalley.ai/e/meta-ai-developer-hackathon
- Participant wiki (kickoff notes): public repo + **3-minute demo video** as primary artifact; track/theme/Meta models required.
- Prior CV submit (Gemini Argon / Get Me An Alt): Team Name, Project Description, Public GitHub, Demo Video URL, “describe use of sponsor products,” optional feedback.
- Login-walled: `/details`, Discord invite, and submit form fields — **human must open the portal signed in** to confirm labels and any extra uploads (cover/gallery/deck).

---

## Confirmed requirements (not optional)

| Item | Value |
|---|---|
| Submission URL | https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit |
| Deadline | Nov 4, 2026 9:00 PM ET |
| Track | **Indie Developer** (solo / teams ≤4; one Representative submits and lists teammates) |
| Theme | **Build for Your World** (also fits Push the Frontier — closed-loop physical verify; pick one: Build for Your World) |
| Public repo | https://github.com/dl88jing/seefix |
| Working demo | https://seefix.vercel.app · lab https://seefix.vercel.app/lab |
| Demo video | **≤ 3 minutes** (ours ~76s) — host typically YouTube/unlisted or public URL |
| New work only | Built during Oct 26–Nov 4 window |
| Meta models | Must genuinely use Meta Model API and/or open weights |
| Affiliation | **Green Robin Labs** (never Adobe) |

### Judging (for copy tone)

Impact 30% · Meta AI tooling 25% · Demo 25% · Technical depth 20%

Bonus plays: Best Build on Open Weight Models (Glimmer + Spark Open), Best Agentic Use-Case, Best Creative Build (Muse Image), Community Vote / Viral (X post link if form asks).

---

## Form field copy (paste-ready)

### 1. Team / Project name
```
SeeFix
```

### 2. Track
```
Indie Developer
```

### 3. Theme / problem statement
```
Build for Your World
```

### 4. Tagline (if asked; ≤100 chars)
```
Camera-first repair copilot: it sees the part and checks your work.
```
*(68 characters)*

### 5. Project Description
```
SeeFix is a camera-first home-repair copilot for first-time fixers and distant family helpers. Point a phone at a broken fixture—our hero is a running toilet—and SeeFix reads the model plate, outlines the exact part to touch, draws the next step on your own photo, blocks unsafe steps, and verifies the fix before you call it done.

Under the hood, Meta models each do real work (not a chat wrapper):
• Muse Spark Open (Baseten, meta-models/muse-spark-open-1026) identifies brand/model/serial from a plate photo into typed JSON.
• SAM 3.1 masks the named part (e.g. “toilet flapper”) on the user’s frame.
• Muse Glimmer (open weights on Modal) is a fail-closed safety gate for gas, live mains, and scald risk.
• Muse Image edits the user’s photo into an annotated step card.
• Rate limits (per-IP + global daily) sit in front of paid calls so the public demo stays honest.

Live: https://seefix.vercel.app · Lab: https://seefix.vercel.app/lab · Source: https://github.com/dl88jing/seefix

Affiliation: Green Robin Labs. Built during the Meta Global AI Developer Hackathon (Oct 26–Nov 4, 2026).
```

### 6. Public Project GitHub Repository
```
https://github.com/dl88jing/seefix
```

### 7. Live demo / product URL (if asked)
```
https://seefix.vercel.app
```
Lab / model bench: `https://seefix.vercel.app/lab`

### 8. Demo video URL
```
<HUMAN: upload video/renders/seefix-demo.mp4 to YouTube as Unlisted, then paste URL here>
```
Local / release backup (works for judges who accept direct MP4):
```
https://github.com/dl88jing/seefix/releases/latest/download/seefix-demo.mp4
```
- Duration: ~76 seconds (under 3-minute cap)
- Path: `video/renders/seefix-demo.mp4`
- Poster: `video/renders/seefix-demo-poster.png`
- Stack: HyperFrames + Kokoro TTS (`af_heart`)

### 9. Describe your use of Meta products / models
```
SeeFix is built around Meta’s Muse stack and SAM, with open weights for the safety path:

1. Muse Spark Open (meta-models/muse-spark-open-1026 via Baseten Chat Completions, OpenAI-compatible) — multimodal plate identify with strict JSON schema / zod validation; Meta muse-spark-1.3 is the fallback when Baseten is unset.
2. SAM 3.1 (Meta Model API Responses, streaming, one_bit masks) — noun-phrase segmentation of the repair part on the user’s photo; client canvas overlay in /lab.
3. Muse Glimmer 30B (open weights on Modal + vLLM) — /api/safety hazard gate with prompt-level JSON contract; fail-closed if the Modal quota service is unreachable on Vercel.
4. Muse Image 1.0 (Meta /v1/images/edits) — turns the user’s frame into an annotated instruction card.
5. Shared Modal quota service — per-IP and global daily limits for identify and safety before any paid call.
6. Standard-mode privacy posture — user repair photos are not sent into Contributor / training modes; keys stay server-side; /api/health exposes only booleans.

Routes live today: /api/identify, /api/segment, /api/card, /api/safety, /api/health. Architecture and env docs are in README.md.
```

### 10. Team members / Representative (Indie)
```
Representative: Dylan Ler (dl88jing@gmail.com)
Affiliation: Green Robin Labs
Teammates: (solo — none)
```

### 11. Cover image
```
File: submission/cover.png (1920×1080)
Alt: submission/cover-from-app.png (composed from live captures)
```

### 12. Gallery (3–5 screenshots of seefix.vercel.app)
```
submission/gallery/gallery-01-landing.png
submission/gallery/gallery-02-how-it-works.png
submission/gallery/gallery-03-plate-upload.png
submission/gallery/gallery-04-identifying.png
submission/gallery/gallery-05-identify-result.png
```

### 13. Pitch deck (PDF)
```
submission/deck/seefix-pitch.pdf
```
Seven slides: title, problem, solution, demo story, Meta tooling, architecture, impact.

### 14. Viral / community X post (bonus, if asked)
```
<HUMAN: post demo clip + live URL on X after submit; paste post URL>
```

### 15. Feedback for Meta (if asked; optional)
```
Spark Open via Baseten with strict JSON schema was reliable once max_tokens accounted for reasoning_content. Glimmer on Modal cold-starts ~2.5m with cached weights—fine for a gate, but a warm pool would help live demos. SAM 3.1 streaming masks are excellent; a lower-latency “keyframe every 0.5s + client interpolate” recipe in the cookbook would help camera-first apps. Wish: clearer public docs on the CV submit field list before the last 48 hours.
```

---

## Assets checklist

| Asset | Path | Ready |
|---|---|---|
| Cover | `submission/cover.png` | yes |
| Gallery ×5 | `submission/gallery/*.png` | yes |
| Pitch PDF | `submission/deck/seefix-pitch.pdf` | yes |
| Demo MP4 | `video/renders/seefix-demo.mp4` (~76s) | yes |
| Field copy | this file | yes |
| YouTube URL | — | **needs human** |
| CV login + paste | portal | **needs human** |
| Official Rules accept | CV details (login) | **needs human if not done** |
| Meta credits claim | Google Form from Oct 26 blast | claim individually by Nov 4 9 PM ET |

---

## Human blockers (cannot automate)

1. **Sign in to Cerebral Valley** and open the submit form; confirm exact field labels / uploads; paste copy from this file.
2. **Upload demo to YouTube (Unlisted)** from `video/renders/seefix-demo.mp4`, paste URL into the video field (and into §8 above).
3. **Meta / CV login** for Official Rules acceptance, Discord, and any credit forms still unpaid.
4. Optional: X post for viral bonus; attach cover/gallery/deck if the form offers uploads.

Do **not** commit secrets (`.env.local`, API keys). Run gitleaks before push.
