import { Router } from "express";
import { MealPlanRequestSchema } from "../schemas/mealPlan.js";
import { generateMealPlan } from "../services/mealPlan.js";
import { config } from "../util/config.js";
import { logger } from "../util/logger.js";

export const mealPlanRouter = Router();

mealPlanRouter.post("/api/meal-plan", (req, res) => {
    const parsed = MealPlanRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "bad_request", issues: parsed.error.issues });
    }
    const resp = generateMealPlan({
        profile: parsed.data.health_profile,
        budget: parsed.data.budget_per_serving_usd,
        cartSummary: parsed.data.cart_summary,
        demoMode: config.demoMode,
    });
    logger.info("meal-plan", `generated ${resp.meals.length} meals budget=${parsed.data.budget_per_serving_usd ?? "-"}`);
    res.json(resp);
});
