import { Router } from "express";
import { config } from "../util/config.js";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        service: "shelfsense-backend",
        version: "0.1.0",
        demoMode: config.demoMode,
        ocrConfigured: Boolean(config.googleVisionApiKey),
        timestamp: new Date().toISOString(),
    });
});

// Lightweight endpoint the lens can poll on startup to tell whether the
// deployed backend has a real OCR provider. Never echoes the key itself.
healthRouter.get("/api/ocr-status", (_req, res) => {
    res.json({
        configured: Boolean(config.googleVisionApiKey),
        provider: config.googleVisionApiKey ? "google-vision" : "none",
    });
});
