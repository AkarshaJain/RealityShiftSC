import express from "express";
import cors from "cors";
import { config } from "./util/config.js";
import { logger } from "./util/logger.js";
import { healthRouter } from "./routes/health.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use((req, _res, next) => {
    logger.info("http", `${req.method} ${req.url}`);
    next();
});

app.use(healthRouter);

app.get("/", (_req, res) => {
    res.json({
        name: "ShelfSense backend",
        hint: "Try GET /health",
    });
});

app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error("http", "unhandled error", { message: err.message, stack: err.stack });
    res.status(500).json({ error: "internal_server_error", message: err.message });
});

app.listen(config.port, () => {
    logger.info("server", `ShelfSense backend listening on http://localhost:${config.port}`);
    logger.info("server", `demoMode=${config.demoMode} env=${config.nodeEnv}`);
});
