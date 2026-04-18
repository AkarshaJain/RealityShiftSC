import { z } from "zod";
import { VerdictSchema } from "./analyze.js";

export const CartUpdateItemSchema = z.object({
    name: z.string().min(1),
    verdict: VerdictSchema,
    ingredients_flags: z.array(z.string()).default([]),
});
export type CartUpdateItem = z.infer<typeof CartUpdateItemSchema>;

export const CartUpdateRequestSchema = z.object({
    session_id: z.string().default("default"),
    item: CartUpdateItemSchema,
    reset: z.boolean().optional(),
});
export type CartUpdateRequest = z.infer<typeof CartUpdateRequestSchema>;

export const CartStateSchema = z.object({
    session_id: z.string(),
    items: z.array(CartUpdateItemSchema),
    counts: z.object({
        Safe: z.number(),
        Caution: z.number(),
        Avoid: z.number(),
    }),
    running_score: z.number(),
    summary: z.string(),
    health_trend: z.string(),
    risk_alerts: z.array(z.string()),
});
export type CartState = z.infer<typeof CartStateSchema>;

export const CartUpdateResponseSchema = z.object({
    cart: CartStateSchema,
    source: z.enum(["heuristic", "demo"]),
    demoMode: z.boolean(),
});
export type CartUpdateResponse = z.infer<typeof CartUpdateResponseSchema>;
