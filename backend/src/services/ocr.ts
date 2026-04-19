// Google Cloud Vision OCR via REST. We use REST (not the @google-cloud/vision
// SDK) on purpose: the SDK drags in gRPC native deps that bloat Render's free
// build and require extra auth plumbing (service account JSON). REST with an
// API key is a single HTTPS POST and works from any Node 18+ runtime.
//
// Docs: https://cloud.google.com/vision/docs/ocr#rest
//       https://cloud.google.com/vision/docs/reference/rest/v1/images/annotate

import { config } from "../util/config.js";
import { logger } from "./../util/logger.js";

export interface OcrResult {
    text: string;
    provider: "google-vision";
    durationMs: number;
    warning?: string;
}

export class OcrNotConfiguredError extends Error {
    constructor() {
        super("GOOGLE_VISION_API_KEY is not set");
        this.name = "OcrNotConfiguredError";
    }
}

export class OcrProviderError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = "OcrProviderError";
        this.status = status;
    }
}

// Vision's REST endpoint expects raw base64 (no `data:image/...;base64,` prefix).
// Callers might send either; strip a data URI prefix defensively.
function stripDataUri(b64: string): string {
    const idx = b64.indexOf(",");
    if (b64.startsWith("data:") && idx !== -1) return b64.slice(idx + 1);
    return b64;
}

export async function ocrImage(imageBase64: string): Promise<OcrResult> {
    if (!config.googleVisionApiKey) {
        throw new OcrNotConfiguredError();
    }

    const started = Date.now();
    const clean = stripDataUri(imageBase64).trim();

    // DOCUMENT_TEXT_DETECTION is better than TEXT_DETECTION for dense label
    // paragraphs (ingredients lists). We ask for English-first language hint
    // but Vision auto-detects — hint just nudges ordering/accuracy.
    const body = {
        requests: [
            {
                image: { content: clean },
                features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
                imageContext: { languageHints: ["en"] },
            },
        ],
    };

    const url = "https://vision.googleapis.com/v1/images:annotate?key=" +
        encodeURIComponent(config.googleVisionApiKey);

    let resp: Response;
    try {
        resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new OcrProviderError("vision network error: " + msg, 502);
    }

    const raw = await resp.text();
    if (!resp.ok) {
        logger.warn("ocr", "vision non-200", { status: resp.status, body: raw.slice(0, 300) });
        throw new OcrProviderError(
            "vision HTTP " + resp.status + ": " + raw.slice(0, 200),
            resp.status,
        );
    }

    let json: any;
    try {
        json = JSON.parse(raw);
    } catch {
        throw new OcrProviderError("vision returned non-JSON", 502);
    }

    const ann = json?.responses?.[0];
    if (ann?.error) {
        throw new OcrProviderError(
            "vision error: " + (ann.error.message ?? "unknown"),
            500,
        );
    }

    // Prefer `fullTextAnnotation.text` (document mode); fall back to the first
    // textAnnotations entry (classic mode). Both come out of Vision uppercase-
    // preserved and newline-separated, which suits our analyzer fine.
    const text: string =
        ann?.fullTextAnnotation?.text ??
        ann?.textAnnotations?.[0]?.description ??
        "";

    const durationMs = Date.now() - started;
    const warning = text.trim().length === 0 ? "no text detected" : undefined;

    logger.info("ocr", "vision done", {
        chars: text.length,
        ms: durationMs,
        warning: warning ?? "ok",
    });

    return { text, provider: "google-vision", durationMs, warning };
}
