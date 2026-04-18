# ShelfSense

Real-world XR grocery assistant for Snap Spectacles.
Pinch to scan a product, get a Safe / Caution / Avoid verdict
based on a personal health profile, hear it spoken aloud,
and see alternatives + cart impact — all in the aisle.

## Who it's for
- People with diabetes or pre-diabetes
- People with food allergies
- People with hypertension
- Low-income families making budget decisions
- Older adults who benefit from voice guidance

## Repo layout
```
.
├── backend/     Node.js + Express + TypeScript API (Layer 3+)
└── lens/        Lens Studio project for Spectacles (Layer 1+)
```

## Build progress (layer-by-layer)
- [x] Layer 0 — Repo audit
- [x] Layer 1 — Lens Studio proof of life
- [x] Layer 2 — Live camera workflow (pinch + frame capture)
- [x] Layer 3 — Backend local proof (3a /health · 3b profile+analyze · 3c speech+cart+meal)
- [ ] Layer 4 — Lens ↔ backend connection
- [ ] Layer 5 — Sample-image testing
- [ ] Layer 6 — Deployment

## Principles
- Free / open-source path is the default. Paid APIs are optional plug-ins.
- No secrets on the glasses. All keys live on the backend.
- Every layer is verified before the next one begins.
- Demo mode is always available so progress never blocks.
