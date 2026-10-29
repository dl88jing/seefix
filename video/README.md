# SeeFix demo video (HyperFrames + Kokoro)

1080p narrated demo for the Meta Global AI Developer Hackathon.

## Rebuild

```bash
cd video
python3 -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile
export PATH="$PWD/.venv/bin:$PATH"
# optional: re-capture live app
# npm install playwright-core && node capture-live.mjs
npx --yes hyperframes@0.8.60 render . -o renders/seefix-demo.mp4
```

Output: `renders/seefix-demo.mp4` · poster `renders/seefix-demo-poster.png`.
