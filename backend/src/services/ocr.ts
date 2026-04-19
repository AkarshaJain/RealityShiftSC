// Zero-config OCR. Two providers, tried in preference order:
//
//   1. OCR.space — free tier, works out of the box with the public demo key
//      "helloworld" (rate-limited, 1 MB/image, but fine for a demo/judging).
//      Users can set OCR_SPACE_API_KEY for higher limits (free signup at
//      ocr.space, gives 25,000 req/month).
//
//   2. Google Cloud Vision — optional upgrade if GOOGLE_VISION_API_KEY is set.
//      Takes precedence when available because it handles dense label
//      paragraphs better than OCR.space's free engine.
//
// Either provider working = real per-product OCR. No provider configured still
// returns a helpful error, never a silent fake.

import { config } from "../util/config.js";
import { logger } from "../util/logger.js";

export type OcrProvider = "google-vision" | "ocr-space";

export interface OcrResult {
    text: string;
    provider: OcrProvider;
    durationMs: number;
    warning?: string;
}

export class OcrNotConfiguredError extends Error {
    constructor() {
        super("no OCR provider is available");
        this.name = "OcrNotConfiguredError";
    }
}

export class OcrProviderError extends Error {
    status: number;
    provider: OcrProvider;
    constructor(provider: OcrProvider, message: string, status: number) {
        super(message);
        this.name = "OcrProviderError";
        this.provider = provider;
        this.status = status;
    }
}

// Defensive: strip a `data:image/...;base64,` prefix. Some clients prepend it,
// others don't. Google Vision rejects it; OCR.space actually requires it, so
// we split the raw bytes once and re-wrap per provider.
function splitDataUri(b64: string): { mime: string; raw: string } {
    const s = b64.trim();
    if (s.startsWith("data:")) {
        const comma = s.indexOf(",");
        if (comma !== -1) {
            const header = s.slice(5, comma);
            const mime = header.split(";")[0] || "image/jpeg";
            return { mime, raw: s.slice(comma + 1) };
        }
    }
    return { mime: "image/jpeg", raw: s };
}

// ---- Google Cloud Vision ----------------------------------------------------

async function ocrWithGoogleVision(raw: string): Promise<OcrResult> {
    const started = Date.now();

    const body = {
        requests: [
            {
                image: { content: raw },
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
        throw new OcrProviderError("google-vision", "network error: " + msg, 502);
    }

    const rawBody = await resp.text();
    if (!resp.ok) {
        logger.warn("ocr", "vision non-200", { status: resp.status, body: rawBody.slice(0, 300) });
        throw new OcrProviderError(
            "google-vision",
            "HTTP " + resp.status + ": " + rawBody.slice(0, 200),
            resp.status,
        );
    }

    let json: any;
    try { json = JSON.parse(rawBody); }
    catch { throw new OcrProviderError("google-vision", "non-JSON", 502); }

    const ann = json?.responses?.[0];
    if (ann?.error) {
        throw new OcrProviderError(
            "google-vision",
            ann.error.message ?? "unknown",
            500,
        );
    }

    const text: string =
        ann?.fullTextAnnotation?.text ??
        ann?.textAnnotations?.[0]?.description ??
        "";

    const durationMs = Date.now() - started;
    return {
        text,
        provider: "google-vision",
        durationMs,
        warning: text.trim().length === 0 ? "no text detected" : undefined,
    };
}

// ---- OCR.space --------------------------------------------------------------
// API: https://ocr.space/OCRAPI
// The free endpoint accepts base64 as a multipart-form field, REQUIRES a data
// URI prefix, and returns JSON with ParsedResults[0].ParsedText.
//
// OCREngine=2 is their newer engine — better for receipts and packaged-goods
// labels than engine 1.

async function ocrWithOcrSpace(mime: string, raw: string): Promise<OcrResult> {
    const started = Date.now();

    // Node 18+ has global FormData + Blob.
    const form = new FormData();
    form.append("base64Image", "data:" + mime + ";base64," + raw);
    form.append("language", "eng");
    form.append("OCREngine", "2");
    form.append("isOverlayRequired", "false");
    form.append("scale", "true");
    form.append("detectOrientation", "true");

    const apiKey = config.ocrSpaceApiKey || "helloworld";

    let resp: Response;
    try {
        resp = await fetch("https://api.ocr.space/parse/image", {
            method: "POST",
            headers: { "apikey": apiKey },
            body: form,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new OcrProviderError("ocr-space", "network error: " + msg, 502);
    }

    const rawBody = await resp.text();
    if (!resp.ok) {
        logger.warn("ocr", "ocr.space non-200", { status: resp.status, body: rawBody.slice(0, 300) });
        throw new OcrProviderError(
            "ocr-space",
            "HTTP " + resp.status + ": " + rawBody.slice(0, 200),
            resp.status,
        );
    }

    let json: any;
    try { json = JSON.parse(rawBody); }
    catch { throw new OcrProviderError("ocr-space", "non-JSON", 502); }

    if (json.IsErroredOnProcessing) {
        const errMsg = Array.isArray(json.ErrorMessage)
            ? json.ErrorMessage.join("; ")
            : String(json.ErrorMessage ?? "unknown");
        throw new OcrProviderError("ocr-space", errMsg, 502);
    }

    const parsed: any[] = Array.isArray(json.ParsedResults) ? json.ParsedResults : [];
    const text: string = parsed
        .map((p) => String(p?.ParsedText ?? ""))
        .join("\n")
        .trim();

    const durationMs = Date.now() - started;
    return {
        text,
        provider: "ocr-space",
        durationMs,
        warning: text.length === 0 ? "no text detected" : undefined,
    };
}

// ---- Public API -------------------------------------------------------------

export function hasAnyOcrProvider(): boolean {
    // OCR.space always works (defaults to the public "helloworld" demo key).
    // Google Vision is only available if a key is set. Either way: true.
    return true;
}

export async function ocrImage(imageBase64: string): Promise<OcrResult> {
    const { mime, raw } = splitDataUri(imageBase64);

    // Prefer Google Vision when the operator has provided a key (better
    // accuracy). Otherwise fall back to OCR.space with helloworld.
    if (config.googleVisionApiKey) {
        try {
            const r = await ocrWithGoogleVision(raw);
            logger.info("ocr", "done", { provider: r.provider, chars: r.text.length, ms: r.durationMs });
            return r;
        } catch (e) {
            // If Vision fails (bad key, quota, etc.) fall through to OCR.space
            // instead of 502'ing. The demo stays usable.
            const msg = e instanceof Error ? e.message : String(e);
            logger.warn("ocr", "vision failed, falling back to ocr.space", { err: msg });
        }
    }

    const r = await ocrWithOcrSpace(mime, raw);
    logger.info("ocr", "done", {
        provider: r.provider,
        chars: r.text.length,
        ms: r.durationMs,
        key: config.ocrSpaceApiKey ? "user" : "helloworld",
    });
    return r;
}
