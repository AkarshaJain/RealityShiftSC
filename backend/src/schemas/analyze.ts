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

export const AnalyzeLabelRequestSchema = z.object({
    ocr_text: z.string().optional(),
    image_base64: z.string().optional(),
    health_profile: HealthProfileSchema,
    product_name: z.string().optional(),
    cart_context: CartContextSchema.optional(),
}).refine(
    (v) => Boolean(v.ocr_text) || Boolean(v.image_base64),
    { message: "provide either ocr_text or image_base64" }
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
    // The lens UI can show a small "demo" badge when source === "demo".
    source: z.enum(["heuristic", "demo"]),
    demoMode: z.boolean(),
});
export type AnalyzeLabelResponse = z.infer<typeof AnalyzeLabelResponseSchema>;
