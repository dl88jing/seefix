# SeeFix architecture

```mermaid
flowchart TB
  subgraph client [Browser]
    Lab["/lab test bench"]
    Cam["Camera / upload"]
  end

  subgraph vercel [Next.js 15 on Vercel]
    Identify["POST /api/identify"]
    Segment["POST /api/segment"]
    Card["POST /api/card"]
    Safety["POST /api/safety"]
    Verify["POST /api/verify\nafter (+before) photo"]
    Health["GET /api/health"]
    QuotaCheck["Modal quota\nper-IP + global daily"]
  end

  subgraph providers [Model providers]
    Baseten["Baseten\nMuse Spark Open 1026"]
    MetaAPI["Meta Model API\nSAM 3.1 · Muse Image 1.0"]
    Modal["Modal H100\nMuse Glimmer 30B + vLLM"]
  end

  Cam --> Lab
  Lab --> Identify
  Lab --> Segment
  Lab --> Card
  Lab --> Safety
  Lab --> Verify
  Lab --> Health

  Identify --> QuotaCheck
  Safety --> QuotaCheck
  Identify -->|"preferred"| Baseten
  Identify -.->|"fallback if BASETEN unset"| MetaAPI
  Verify --> QuotaCheck
  Verify -->|"preferred"| Baseten
  Segment --> MetaAPI
  Card --> MetaAPI
  Safety --> Modal
  QuotaCheck --> Modal
```

## Live vs planned

| Path | Status |
|---|---|
| identify · segment · card · safety · health | **Live** on https://seefix.vercel.app (measured Oct 31, 2026 PT) |
| verify (after photo + optional before → Muse Spark Open, strict JSON) | **Live** (measured Nov 1, 2026 PT) |
| plan · asr · recap · continuous camera / clip verify · Neon/Blob | Planned — listed in README ASCII diagram, not claimed as shipped |

## Failure contract

| Condition | HTTP | Body |
|---|---|---|
| Missing env var | 503 | `not_configured` + `missing_env` |
| Meta billing inactive | 503 | `meta_api_not_active` (Lab amber banner) |
| Rate limit | 429 | `rate_limited` + `Retry-After` |
| Quota service down on Vercel | 503 | fail closed |
| Upstream model error | 502 / upstream | `upstream_error` + source |

No mock appliance IDs, masks, cards, or safety verdicts are ever returned.
