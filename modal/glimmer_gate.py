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
GLIMMER_API_KEY on Vercel, and set GLIMMER_URL to the printed web URL.
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
    modal.Image.from_registry(VLLM_IMAGE)
    .entrypoint([])  # the image's ENTRYPOINT is `vllm serve`; Modal runs its own
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "0", "HF_XET_HIGH_PERFORMANCE": "1"})
)

app = modal.App("seefix-glimmer-gate", image=image)

secrets = [modal.Secret.from_name("seefix-glimmer", required_keys=["GLIMMER_API_KEY"])]


@app.function(volumes={"/root/.cache/huggingface": hf_cache}, timeout=60 * MINUTES, cpu=4, memory=8192)
def download_weights():
    """CPU-only pre-download so GPU containers never pay for the 60 GB pull."""
    from huggingface_hub import snapshot_download

    path = snapshot_download(MODEL_ID, revision=MODEL_REVISION)
    hf_cache.commit()
    print("weights ready at", path)


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
