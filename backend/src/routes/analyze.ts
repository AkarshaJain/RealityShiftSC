import { Router } from "express";
import {
    AnalyzeLabelRequestSchema,
    type AnalyzeLabelResponse,
} from "../schemas/analyze.js";
import { analyzeLabel } from "../services/analyzer.js";
import { config } from "../util/config.js";
import { logger } from "../util/logger.js";

export const analyzeRouter = Router();

analyzeRouter.post("/api/analyze-label", (req, res) => {
    const parsed = AnalyzeLabelRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "bad_request", issues: parsed.error.issues });
    }

    const body = parsed.data;

    // OCR support arrives in a dedicated sub-layer (Layer 3b-OCR / Layer 5).
    // Until then, image_base64 is accepted by the schema but deferred here with
    // a clear message — no silent fake.
    if (!body.ocr_text && body.image_base64) {
        return res.status(501).json({
            error: "ocr_not_enabled",
            message: "Send ocr_text for now. Tesseract OCR will be wired in Layer 5.",
        });
    }

    const core = analyzeLabel({
        ocrText: body.ocr_text ?? "",
        profile: body.health_profile,
        productName: body.product_name,
        cart: body.cart_context,
    });

    const resp: AnalyzeLabelResponse = {
        ...core,
        source: "heuristic",
        demoMode: config.demoMode,
    };

    logger.info("analyze", "done", {
        product: body.product_name ?? "(unnamed)",
        verdict: resp.verdict,
        flags: resp.ingredients_flags.length,
    });
    res.json(resp);
});
