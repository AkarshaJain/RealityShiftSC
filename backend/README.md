# ShelfSense Backend

Node.js + Express + TypeScript API for the ShelfSense XR grocery assistant.
Runs 100% locally on the free path — no API keys required for the MVP.

## Stack

- Node.js 18+
- Express 4
- Zod (input validation — used from Layer 3b)
- TypeScript + `tsx` for dev watch
- Demo mode flag for mock responses when real logic is unavailable

## Setup (one time)

```powershell
cd "d:\RealityShift SC\backend"
npm install
Copy-Item .env.example .env    # edit if you want to change PORT or DEMO_MODE
```

## Run (dev, auto-reload on file save)

```powershell
cd "d:\RealityShift SC\backend"
npm run dev
```

You should see:

```
[...] [INFO] [server] ShelfSense backend listening on http://localhost:3000
[...] [INFO] [server] demoMode=true env=development
```

Stop the server with **Ctrl+C**.

## Endpoints (progress)

| Status | Method | Path                   | Purpose                                 |
|--------|--------|------------------------|-----------------------------------------|
| ✅     | GET    | `/`                    | Welcome + hint                          |
| ✅     | GET    | `/health`              | Liveness + config snapshot              |
| ⏳     | POST   | `/api/profile/parse`   | Lab report → structured health profile  |
| ⏳     | POST   | `/api/analyze-label`   | Frame + profile → Safe/Caution/Avoid    |
| ⏳     | POST   | `/api/speech`          | Verdict text → audio / fallback         |
| ⏳     | POST   | `/api/cart/update`     | Running cart summary + health trend     |
| ⏳     | POST   | `/api/meal-plan`       | Budget meal ideas from profile + cart   |

## Verify manually (PowerShell)

```powershell
Invoke-RestMethod http://localhost:3000/health | ConvertTo-Json
```

Expected:

```json
{
  "status": "ok",
  "service": "shelfsense-backend",
  "version": "0.1.0",
  "demoMode": true,
  "timestamp": "..."
}
```

## Folder layout

```
backend/
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── server.ts           Express bootstrap, middleware, 404/500 handlers
│   ├── routes/
│   │   └── health.ts       GET /health
│   └── util/
│       ├── config.ts       env → typed config
│       └── logger.ts       leveled logger with scope
└── test-samples/           (Layer 5 grocery product test images)
```

## Principles

- All secrets live in `.env` — **never** on the Spectacles device.
- Demo mode is first-class; the lens can run even if real analyzers are down.
- Free/open tools are the default. Paid providers are clean plug-ins behind interfaces.
