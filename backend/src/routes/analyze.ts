import { Router } from "express";
import {
    AnalyzeLabelRequestSchema,
    type AnalyzeLabelResponse,
} from "../schemas/analyze.js";
import { analyzeLabel } from "../services/analyzer.js";
import { DEMO_PROFILES, type DemoProfileId } from "../demo/profiles.js";
import type { HealthProfile } from "../schemas/profile.js";
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

    // Resolve the health profile. `health_profile` (full object) takes priority;
    // otherwise look up a demo profile by `profile_id`. The schema guarantees at
    // least one of the two is present.
    let profile: HealthProfile | undefined = body.health_profile;
    if (!profile && body.profile_id) {
        const id = body.profile_id as DemoProfileId;
        if (!(id in DEMO_PROFILES)) {
            return res.status(400).json({
                error: "unknown_profile_id",
                message: "profile_id must be one of: " + Object.keys(DEMO_PROFILES).join(", "),
            });
        }
        profile = DEMO_PROFILES[id];
    }
    if (!profile) {
        return res.status(400).json({
            error: "no_profile",
            message: "provide health_profile or profile_id",
        });
    }

    const core = analyzeLabel({
        ocrText: body.ocr_text ?? "",
        profile,
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
        profile_id: body.profile_id ?? "(custom)",
        session_id: body.session_id ?? "(none)",
        capture: body.capture ?? null,
        verdict: resp.verdict,
        flags: resp.ingredients_flags.length,
    });
    res.json(resp);
});
