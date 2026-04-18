import { z } from "zod";

export const SpeechRequestSchema = z.object({
    text: z.string().min(1).max(500),
    verdict: z.enum(["Safe", "Caution", "Avoid"]).optional(),
});
export type SpeechRequest = z.infer<typeof SpeechRequestSchema>;

// Free path: client-side TTS. Server returns the exact phrase the lens should
// speak. Later, a server-side TTS provider can switch `mode` to "audio_base64".
export const SpeechResponseSchema = z.object({
    mode: z.enum(["client_tts", "audio_base64"]),
    text: z.string(),
    ssml: z.string().optional(),
    audio_base64: z.string().optional(),
    mime: z.string().optional(),
    source: z.enum(["heuristic", "demo"]),
    demoMode: z.boolean(),
});
export type SpeechResponse = z.infer<typeof SpeechResponseSchema>;
