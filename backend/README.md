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

| Status | Method | Path                        | Purpose                                       |
|--------|--------|-----------------------------|-----------------------------------------------|
| ✅     | GET    | `/`                         | Welcome + hint                                |
| ✅     | GET    | `/health`                   | Liveness + config snapshot                    |
| ✅     | POST   | `/api/profile/parse`        | Lab report text → structured health profile   |
| ✅     | GET    | `/api/profile/demo/:id`     | Demo profile (`diabetic`, `allergy`, `budget`)|
| ✅     | POST   | `/api/analyze-label`        | Label text + profile → Safe/Caution/Avoid     |
| ⏳     | POST   | `/api/speech`               | Verdict text → audio / fallback               |
| ⏳     | POST   | `/api/cart/update`          | Running cart summary + health trend           |
| ⏳     | POST   | `/api/meal-plan`            | Budget meal ideas from profile + cart         |
| ⏳     | —      | image_base64 input for `/api/analyze-label` (Tesseract OCR wired in Layer 5) |

### Verify Layer 3b (PowerShell)

```powershell
# 1. Parse a realistic lab report
$body = @{ text = "Total Cholesterol 235 mg/dL. LDL 162 mg/dL. Fasting glucose 141 mg/dL. HbA1c 6.9%. BP 148/92 (hypertension). Allergy: peanuts." } | ConvertTo-Json
$profileResp = Invoke-RestMethod http://localhost:3000/api/profile/parse -Method POST -Body $body -ContentType 'application/json'
$profileResp | ConvertTo-Json -Depth 6

# 2. Pull a canned demo profile
Invoke-RestMethod http://localhost:3000/api/profile/demo/diabetic | ConvertTo-Json -Depth 6

# 3. Analyze a sugary cereal against that parsed profile
$analyze = @{
  ocr_text    = "Ingredients: enriched wheat flour, sugar, high fructose corn syrup, hydrogenated palm oil. Per serving: Calories 230 kcal, Protein 3 g, Carbohydrate 45 g, Sugars 22 g, Fat 8 g, Sodium 310 mg."
  product_name = "Crunch Nuggets"
  health_profile = $profileResp.profile
} | ConvertTo-Json -Depth 6
Invoke-RestMethod http://localhost:3000/api/analyze-label -Method POST -Body $analyze -ContentType 'application/json' | ConvertTo-Json -Depth 6
```

Expected `analyze-label` highlights: `verdict: "Avoid"`, `ingredients_flags` contains `high sugar (22 g)`, `trans fat / hydrogenated oil`, `added sugar: HFCS`, with 3 alternatives and a diabetic-aware meal hint.

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
