#!/usr/bin/env bash
# One-command local/judge demo for SeeFix.
# Default: health + unit tests (no API keys required).
# LIVE=1 ./demo.sh also POSTs /api/identify against the public deploy (uses rate limit).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

LIVE_URL="${LIVE_URL:-https://seefix.vercel.app}"

echo "== SeeFix demo =="
echo "Repo:  https://github.com/dl88jing/seefix"
echo "Live:  $LIVE_URL"
echo "Lab:   $LIVE_URL/lab"
echo "Video: https://youtu.be/Mk7XkNJ0lXE"
echo

echo "-- GET $LIVE_URL/api/health --"
curl -sS "$LIVE_URL/api/health" | python3 -m json.tool
echo

if [[ "${LIVE:-0}" == "1" ]]; then
  IMG="${DEMO_IMAGE:-$ROOT/video/assets/sample-plate.jpg}"
  if [[ ! -f "$IMG" ]]; then
    echo "DEMO_IMAGE not found: $IMG" >&2
    exit 1
  fi
  echo "-- LIVE POST /api/identify (sample plate) --"
  python3 - "$IMG" "$LIVE_URL" <<'PY'
import base64, json, pathlib, sys, time, urllib.request
img_path, base = sys.argv[1], sys.argv[2]
b64 = base64.b64encode(pathlib.Path(img_path).read_bytes()).decode()
body = json.dumps({"image": f"data:image/jpeg;base64,{b64}"}).encode()
req = urllib.request.Request(
    f"{base}/api/identify",
    data=body,
    headers={"Content-Type": "application/json"},
    method="POST",
)
t0 = time.time()
try:
    with urllib.request.urlopen(req, timeout=180) as r:
        raw = r.read().decode()
        status = r.status
except Exception as e:
    raw = e.read().decode() if hasattr(e, "read") else str(e)
    status = getattr(e, "code", "?")
ms = int((time.time() - t0) * 1000)
print(f"HTTP {status} in {ms} ms")
try:
    data = json.loads(raw)
except Exception:
    print(raw[:500])
    sys.exit(1)
# Never dump huge payloads; show judge-relevant fields only.
out = {
    "model": data.get("model"),
    "provider": data.get("provider"),
    "appliance": data.get("appliance"),
    "error": data.get("error"),
    "title": data.get("title"),
    "message": data.get("message"),
    "usage": data.get("usage"),
}
print(json.dumps({k: v for k, v in out.items() if v is not None}, indent=2))
if status != 200:
    sys.exit(1)
PY
  echo
fi

if [[ "${SKIP_TESTS:-0}" != "1" ]]; then
  if [[ ! -d node_modules ]]; then
    echo "-- npm ci --"
    npm ci
  fi
  echo "-- npm test --"
  npm test
fi

echo
echo "OK. Open $LIVE_URL/lab and run Identify / Segment / Card / Safety on a photo."
echo "Fallback honesty: Meta-backed routes return HTTP 503 meta_api_not_active if billing is off; missing keys return 503 not_configured (no mocks)."
