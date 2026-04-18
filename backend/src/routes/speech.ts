import { Router } from "express";
import { SpeechRequestSchema } from "../schemas/speech.js";
import { generateSpeech } from "../services/tts.js";
import { config } from "../util/config.js";
import { logger } from "../util/logger.js";

export const speechRouter = Router();

speechRouter.post("/api/speech", (req, res) => {
    const parsed = SpeechRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "bad_request", issues: parsed.error.issues });
    }
    const resp = generateSpeech(parsed.data, config.demoMode);
    logger.info("speech", `generated (${parsed.data.text.length} chars, verdict=${parsed.data.verdict ?? "-"})`);
    res.json(resp);
});
