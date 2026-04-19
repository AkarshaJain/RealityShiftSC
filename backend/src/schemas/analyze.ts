import { z } from "zod";
import { HealthProfileSchema } from "./profile.js";

export const VerdictSchema = z.enum(["Safe", "Caution", "Avoid"]);
export type Verdict = z.infer<typeof VerdictSchema>;

export const MacroBreakdownSchema = z.object({
    calories: z.string(),
    protein: z.string(),
    carbs: z.string(),
    fat: z.string(),
    sugar: z.string(),
    sodium: z.string(),
});
export type MacroBreakdown = z.infer<typeof MacroBreakdownSchema>;

export const AlternativeSchema = z.object({
    name: z.string(),
    why_better: z.string(),
});
export type Alternative = z.infer<typeof AlternativeSchema>;

export const CartItemSchema = z.object({
    name: z.string(),
    verdict: VerdictSchema,
});
export type CartItem = z.infer<typeof CartItemSchema>;

export const CartContextSchema = z.object({
    items: z.array(CartItemSchema).default([]),
    running_score: z.number().optional(),
});
export type CartContext = z.infer<typeof CartContextSchema>;

export const CartImpactSchema = z.object({
    summary: z.string(),
    running_score: z.string(),
});
export type CartImpact = z.infer<typeof CartImpactSchema>;

// Clients can send either a full `health_profile` OR reference a demo profile by
// `profile_id` (one of the keys in backend/src/demo/profiles.ts). This lets lean
// clients (like the Spectacles lens) keep a single string instead of replicating
// the full profile schema on every request.
export const AnalyzeLabelRequestSchema = z.object({
    ocr_text: z.string().optional(),
    image_base64: z.string().optional(),
    health_profile: HealthProfileSchema.optional(),
    profile_id: z.string().optional(),
    product_name: z.string().optional(),
    cart_context: CartContextSchema.optional(),
    // Arbitrary capture metadata from the client (frame size, pinch id, etc.).
    // Recorded for diagnostics, not required for analysis.
    capture: z.record(z.string(), z.unknown()).optional(),
    session_id: z.string().optional(),
}).refine(
    (v) => Boolean(v.ocr_text) || Boolean(v.image_base64),
    { message: "provide either ocr_text or image_base64" }
).refine(
    (v) => Boolean(v.health_profile) || Boolean(v.profile_id),
    { message: "provide either health_profile or profile_id" }
);
export type AnalyzeLabelRequest = z.infer<typeof AnalyzeLabelRequestSchema>;

export const AnalyzeLabelResponseSchema = z.object({
    verdict: VerdictSchema,
    reason: z.string(),
    ingredients_flags: z.array(z.string()),
    macro_breakdown: MacroBreakdownSchema,
    health_risks: z.array(z.string()),
    better_alternatives: z.array(AlternativeSchema),
    cart_impact: CartImpactSchema,
    meal_plan_hint: z.string(),
    // Meta — not in the original spec but critical for trust + debugging.
    // The lens shows a "DEMO" indicator whenever source !== "heuristic".
    //   heuristic     — real ingredients text (OCR or client-provided) ran through the analyzer
    //   demo          — server returned labeled demo content
    //   demo-no-ocr   — client sent an image but OCR wasn't configured; we
    //                   substituted demo text so the UI still works
    source: z.enum(["heuristic", "demo", "demo-no-ocr"]),
    demoMode: z.boolean(),
});
export type AnalyzeLabelResponse = z.infer<typeof AnalyzeLabelResponseSchema>;
