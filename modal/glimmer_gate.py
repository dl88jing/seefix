"""
SeeFix safety gate: Meta Muse Glimmer (open weights) served by vLLM on Modal,
behind an OpenAI-compatible endpoint (/v1/chat/completions).

Model:   meta-models/Muse-Glimmer-30B  (public, Apache-2.0, ungated; ~60 GB bf16)
Runtime: vllm/vllm-openai:muse-glimmer (Meta/vLLM-published image for Glimmer)
GPU:     needs ~72 GB VRAM in bf16 -> one H100 80GB (A100-80GB also works)

Usage:
    modal run modal/glimmer_gate.py::download_weights   # one-time, CPU only: fills the HF cache volume
    modal deploy modal/glimmer_gate.py                  # deploys the scale-to-zero web endpoint

Auth: if a Modal secret named "seefix-glimmer" contains GLIMMER_API_KEY, vLLM
requires `Authorization: Bearer <GLIMMER_API_KEY>`. Set the same value as
GLIMMER_API_KEY on Vercel, and set GLIMMER_URL to the printed web URL of `serve`
and GLIMMER_QUOTA_URL to the printed web URL of `quota` (the rate limiter).
"""

import os
import subprocess

import modal

MODEL_ID = "meta-models/Muse-Glimmer-30B"  # confirmed on Hugging Face (not gated)
MODEL_REVISION = os.environ.get("GLIMMER_REVISION", "main")
SERVED_NAME = "muse-glimmer"
VLLM_IMAGE = "vllm/vllm-openai:muse-glimmer"
GPU = os.environ.get("GLIMMER_GPU", "H100")
PORT = 8000
MINUTES = 60

hf_cache = modal.Volume.from_name("seefix-glimmer-hf-cache", create_if_missing=True)
vllm_cache = modal.Volume.from_name("seefix-glimmer-vllm-cache", create_if_missing=True)

image = (
    modal.Image.from_registry(
        VLLM_IMAGE,
        # Modal's own runtime gets a separate interpreter; vLLM keeps the image's
        # Python and is launched as the `vllm` CLI in a subprocess.
        add_python="3.12",
    )
    .entrypoint([])  # the image's ENTRYPOINT is `vllm serve`; Modal runs its own
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "0", "HF_XET_HIGH_PERFORMANCE": "1"})
)

app = modal.App("seefix-glimmer-gate", image=image)

secrets = [modal.Secret.from_name("seefix-glimmer", required_keys=["GLIMMER_API_KEY"])]


@app.function(volumes={"/root/.cache/huggingface": hf_cache}, timeout=60 * MINUTES, cpu=4, memory=8192)
def download_weights():
    """CPU-only pre-download so GPU containers never pay for the 60 GB pull."""
    py = _image_python()
    code = (
        "from huggingface_hub import snapshot_download;"
        f"print(snapshot_download({MODEL_ID!r}, revision={MODEL_REVISION!r}, max_workers=16))"
    )
    subprocess.run([py, "-c", code], check=True)
    hf_cache.commit()
    print("weights ready in volume seefix-glimmer-hf-cache")


def _image_python() -> str:
    """The interpreter vLLM was installed into (from the `vllm` script's shebang)."""
    import shutil

    vllm_bin = shutil.which("vllm")
    if vllm_bin:
        with open(vllm_bin) as f:
            first = f.readline().strip()
        if first.startswith("#!") and "python" in first:
            return first[2:].split()[0]
    return "/usr/bin/python3"


@app.function(
    gpu=GPU,
    secrets=secrets,
    volumes={"/root/.cache/huggingface": hf_cache, "/root/.cache/vllm": vllm_cache},
    timeout=30 * MINUTES,
    scaledown_window=5 * MINUTES,  # scale to zero quickly; no idle GPU burn
    min_containers=0,
    max_containers=1,
)
@modal.concurrent(max_inputs=16)
@modal.web_server(port=PORT, startup_timeout=25 * MINUTES)
def serve():
    cmd = [
        "vllm",
        "serve",
        MODEL_ID,
        "--revision",
        MODEL_REVISION,
        "--served-model-name",
        SERVED_NAME,
        "--host",
        "0.0.0.0",
        "--port",
        str(PORT),
        "--tensor-parallel-size",
        "1",
        "--enable-auto-tool-choice",
        "--tool-call-parser",
        "muse_glimmer",
        "--reasoning-parser",
        "muse_glimmer",
        "--generation-config",
        "auto",
        "--gpu-memory-utilization",
        "0.92",
        "--max-model-len",
        os.environ.get("GLIMMER_MAX_LEN", "16384"),
    ]
    if os.environ.get("GLIMMER_API_KEY"):
        cmd += ["--api-key", os.environ["GLIMMER_API_KEY"]]
    print("starting:", " ".join(a if not a.startswith("sk-") else "***" for a in cmd[:-2]))
    subprocess.Popen(cmd)


# ---------------------------------------------------------------------------
# Quota service: the authoritative rate limiter for the public /api/safety route.
# A tiny CPU function (scale-to-zero, one container, serialized with a lock) keeps
# counters in a Modal Dict so limits hold across every Vercel instance:
#   - SAFETY_PER_IP_PER_HOUR per hashed IP (sliding 1 h window), default 10
#   - SAFETY_GLOBAL_PER_DAY for the whole site (UTC day), default 100
# Vercel sends only an HMAC of the client IP, never the raw IP.
# ---------------------------------------------------------------------------
PER_IP_PER_HOUR = int(os.environ.get("SAFETY_PER_IP_PER_HOUR", "10"))
GLOBAL_PER_DAY = int(os.environ.get("SAFETY_GLOBAL_PER_DAY", "100"))

quota_image = modal.Image.debian_slim(python_version="3.12").pip_install("fastapi[standard]").env(
    {"SAFETY_PER_IP_PER_HOUR": str(PER_IP_PER_HOUR), "SAFETY_GLOBAL_PER_DAY": str(GLOBAL_PER_DAY)}
)
quota_dict = modal.Dict.from_name("seefix-glimmer-quota", create_if_missing=True)


@app.function(
    image=quota_image,
    secrets=secrets,
    cpu=0.25,
    memory=256,
    min_containers=0,
    max_containers=1,  # single writer: the asyncio lock below makes check-and-increment atomic
    scaledown_window=2 * MINUTES,
)
@modal.concurrent(max_inputs=32)
@modal.asgi_app()
def quota():
    import asyncio
    import hmac
    import time

    from fastapi import FastAPI, Header, HTTPException
    from pydantic import BaseModel

    web = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    lock = asyncio.Lock()
    per_ip = int(os.environ["SAFETY_PER_IP_PER_HOUR"])
    per_day = int(os.environ["SAFETY_GLOBAL_PER_DAY"])
    expected = os.environ.get("GLIMMER_API_KEY", "")

    class Check(BaseModel):
        key: str

    @web.post("/check")
    async def check(body: Check, authorization: str = Header(default="")):
        if not expected or not hmac.compare_digest(authorization, f"Bearer {expected}"):
            raise HTTPException(status_code=401, detail="unauthorized")
        key = body.key[:64]
        now = time.time()
        day = time.strftime("%Y-%m-%d", time.gmtime(now))
        async with lock:
            day_key = f"day:{day}"
            used_today = await quota_dict.get.aio(day_key, 0)
            if used_today >= per_day:
                retry = int(86400 - (now % 86400)) + 1
                return {"allowed": False, "scope": "global", "retry_after": retry}
            ip_key = f"ip:{key}"
            hits = [t for t in await quota_dict.get.aio(ip_key, []) if now - t < 3600]
            if len(hits) >= per_ip:
                return {"allowed": False, "scope": "ip", "retry_after": int(hits[0] + 3600 - now) + 1}
            hits.append(now)
            await quota_dict.put.aio(ip_key, hits)
            await quota_dict.put.aio(day_key, used_today + 1)
            return {
                "allowed": True,
                "remaining_ip": per_ip - len(hits),
                "remaining_global": per_day - used_today - 1,
            }

    return web


@app.local_entrypoint()
def smoke(url: str = "", key: str = ""):
    """`modal run modal/glimmer_gate.py --url https://... --key ...` sends one text request."""
    import json
    import urllib.request

    url = url or serve.get_web_url()
    body = json.dumps(
        {
            "model": SERVED_NAME,
            "messages": [{"role": "user", "content": "Is it safe to replace a toilet flapper without turning off the water? One sentence."}],
            "max_tokens": 2048,
        }
    ).encode()
    req = urllib.request.Request(f"{url}/v1/chat/completions", data=body, headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {key}"} if key else {})})
    with urllib.request.urlopen(req, timeout=30 * MINUTES) as r:
        print(json.loads(r.read())["choices"][0]["message"])
