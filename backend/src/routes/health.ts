import { Router } from "express";
import { config } from "../util/config.js";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        service: "shelfsense-backend",
        version: "0.1.0",
        demoMode: config.demoMode,
        timestamp: new Date().toISOString(),
    });
});
