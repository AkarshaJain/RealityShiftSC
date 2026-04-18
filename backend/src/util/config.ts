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
};
