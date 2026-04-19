import "dotenv/config";

function envString(key: string, fallback: string): string {
    const v = process.env[key];
    return v === undefined || v === "" ? fallback : v;
}

function envBool(key: string, fallback: boolean): boolean {
    const v = process.env[key];
    if (v === undefined) return fallback;
    return v.toLowerCase() === "true" || v === "1";
}

function envInt(key: string, fallback: number): number {
    const v = process.env[key];
    if (v === undefined || v === "") return fallback;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
}

export const config = {
    port: envInt("PORT", 3000),
    nodeEnv: envString("NODE_ENV", "development"),
    demoMode: envBool("DEMO_MODE", true),
    // Optional upgrade: Google Cloud Vision API key. When set, the backend
    // prefers Vision over OCR.space (better accuracy on dense labels).
    googleVisionApiKey: envString("GOOGLE_VISION_API_KEY", ""),
    // Optional: OCR.space API key for higher rate limits. Defaults to the
    // public "helloworld" demo key, which works out of the box but is
    // rate-limited. Free signup at https://ocr.space/ocrapi gives 25k/month.
    ocrSpaceApiKey: envString("OCR_SPACE_API_KEY", ""),
};
