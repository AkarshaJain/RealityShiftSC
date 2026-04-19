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
import {
    ocrImage,
    OcrNotConfiguredError,
    OcrProviderError,
} from "../services/ocr.js";

export const analyzeRouter = Router();

analyzeRouter.post("/api/analyze-label", async (req, res) => {
    const parsed = AnalyzeLabelRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "bad_request", issues: parsed.error.issues });
    }

    const body = parsed.data;

    // Resolve the health profile FIRST so we can fail fast before paying for OCR.
    // `health_profile` (full object) takes priority; otherwise look up a demo
    // profile by `profile_id`. The schema guarantees at least one of the two.
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

    // Resolve the OCR text. Precedence:
    //   1. explicit ocr_text (fastest — client already did OCR or is testing)
    //   2. image_base64 → Google Cloud Vision OCR (the real product-scan path)
    // If only an image is sent and Vision is not configured, return 501 with
    // a clear setup message (no silent fake).
    let ocrText = body.ocr_text ?? "";
    let ocrMeta: { provider: string; ms: number; chars: number; warning?: string } | null = null;

    if (!ocrText && body.image_base64) {
        try {
            const result = await ocrImage(body.image_base64);
            ocrText = result.text;
            ocrMeta = {
                provider: result.provider,
                ms: result.durationMs,
                chars: result.text.length,
                warning: result.warning,
            };
        } catch (e) {
            if (e instanceof OcrNotConfiguredError) {
                return res.status(501).json({
                    error: "ocr_not_configured",
                    message:
                        "Set GOOGLE_VISION_API_KEY in the backend env to enable " +
                        "image OCR. For now, send ocr_text directly.",
                });
            }
            if (e instanceof OcrProviderError) {
                return res.status(502).json({
                    error: "ocr_provider_error",
                    message: e.message,
                });
            }
            const msg = e instanceof Error ? e.message : String(e);
            logger.error("analyze", "unexpected OCR failure", { msg });
            return res.status(500).json({ error: "ocr_failed", message: msg });
        }
    }

    // If after OCR we still have no text at all, the product label was unreadable.
    // Return 200 with a clear "Caution" verdict rather than 500 — the lens still
    // has something useful to display.
    if (!ocrText || ocrText.trim().length === 0) {
        const empty: AnalyzeLabelResponse = {
            verdict: "Caution",
            reason: "Could not read the label clearly. Try again with better lighting or a closer angle.",
            ingredients_flags: [],
            macro_breakdown: {
                calories: "unknown", protein: "unknown", carbs: "unknown",
                fat: "unknown", sugar: "unknown", sodium: "unknown",
            },
            health_risks: [],
            better_alternatives: [],
            cart_impact: { summary: "Cart unchanged (no scan)", running_score: "-" },
            meal_plan_hint: "Re-scan the label when the text is in focus.",
            source: "heuristic",
            demoMode: config.demoMode,
        };
        logger.warn("analyze", "no ocr text", { ocrMeta });
        return res.json(empty);
    }

    const core = analyzeLabel({
        ocrText,
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
        ocr: ocrMeta ?? "(text-direct)",
        verdict: resp.verdict,
        flags: resp.ingredients_flags.length,
    });
    res.json(resp);
});
