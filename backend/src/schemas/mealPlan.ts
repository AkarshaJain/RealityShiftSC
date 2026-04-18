import { z } from "zod";
import { HealthProfileSchema } from "./profile.js";

export const MealPlanRequestSchema = z.object({
    health_profile: HealthProfileSchema,
    budget_per_serving_usd: z.number().positive().max(50).optional(),
    cart_summary: z.string().optional(),
});
export type MealPlanRequest = z.infer<typeof MealPlanRequestSchema>;

export const MealIdeaSchema = z.object({
    name: z.string(),
    slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
    ingredients: z.array(z.string()),
    est_cost_usd_per_serving: z.number(),
    rationale: z.string(),
});
export type MealIdea = z.infer<typeof MealIdeaSchema>;

export const MealPlanResponseSchema = z.object({
    meals: z.array(MealIdeaSchema),
    source: z.enum(["heuristic", "demo"]),
    demoMode: z.boolean(),
    notes: z.string(),
});
export type MealPlanResponse = z.infer<typeof MealPlanResponseSchema>;
