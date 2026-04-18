import type { SpeechRequest, SpeechResponse } from "../schemas/speech.js";

// Free-path TTS: tell the client exactly what to say.
// Provides simple SSML so capable clients can inflect appropriately.
// Server-side audio generation is a clean plug-in point — not wired here.

function buildSsml(text: string, verdict?: "Safe" | "Caution" | "Avoid"): string {
    const rate = verdict === "Avoid" ? "95%" : verdict === "Caution" ? "100%" : "105%";
    const pitch = verdict === "Avoid" ? "-2st" : verdict === "Caution" ? "0st" : "+1st";
    const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<speak><prosody rate="${rate}" pitch="${pitch}">${safe}</prosody></speak>`;
}

export function generateSpeech(
    req: SpeechRequest,
    demoMode: boolean,
): SpeechResponse {
    return {
        mode: "client_tts",
        text: req.text,
        ssml: buildSsml(req.text, req.verdict),
        source: "heuristic",
        demoMode,
    };
}
