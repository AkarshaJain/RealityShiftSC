import type { HealthProfile } from "../schemas/profile.js";
import type { MealIdea, MealPlanResponse } from "../schemas/mealPlan.js";

// Small, editable template library. Each meal declares which allergens it
// contains (so we filter them) and which profile-tags it supports (so we rank).

type Template = {
    name: string;
    slot: MealIdea["slot"];
    ingredients: string[];
    cost_usd: number;
    contains: string[];               // allergen canonical terms
    supports: Array<"diabetic" | "heart" | "low-sodium" | "budget" | "vegan" | "high-fiber" | "iron">;
    rationale: string;
};

const TEMPLATES: Template[] = [
    {
        name: "Steel-cut oats with banana + chia",
        slot: "breakfast",
        ingredients: ["steel-cut oats", "banana", "chia seeds", "cinnamon"],
        cost_usd: 0.60,
        contains: [],
        supports: ["diabetic", "heart", "budget", "high-fiber"],
        rationale: "Slow carbs + soluble fiber keep glucose steady and lower LDL.",
    },
    {
        name: "Lentil dal with brown rice",
        slot: "dinner",
        ingredients: ["red lentils", "brown rice", "onion", "garlic", "turmeric", "cumin"],
        cost_usd: 0.80,
        contains: [],
        supports: ["diabetic", "budget", "vegan", "iron", "high-fiber"],
        rationale: "Plant protein + iron + whole grain; cheap and diabetic-friendly.",
    },
    {
        name: "Chickpea and cucumber salad",
        slot: "lunch",
        ingredients: ["chickpeas", "cucumber", "tomato", "lemon", "olive oil"],
        cost_usd: 0.70,
        contains: [],
        supports: ["diabetic", "heart", "budget", "vegan", "high-fiber"],
        rationale: "High fiber, low sodium, heart-healthy olive oil.",
    },
    {
        name: "Scrambled eggs with spinach on whole-wheat toast",
        slot: "breakfast",
        ingredients: ["eggs", "spinach", "whole-wheat bread", "olive oil"],
        cost_usd: 1.00,
        contains: ["egg", "gluten"],
        supports: ["diabetic", "iron", "high-fiber"],
        rationale: "Protein-forward breakfast with iron + folate from spinach.",
    },
    {
        name: "Grilled chicken + quinoa + broccoli",
        slot: "dinner",
        ingredients: ["chicken breast", "quinoa", "broccoli", "olive oil", "lemon"],
        cost_usd: 2.00,
        contains: [],
        supports: ["diabetic", "heart"],
        rationale: "Lean protein, complete grain, cruciferous veg.",
    },
    {
        name: "Tofu stir-fry with brown rice",
        slot: "dinner",
        ingredients: ["tofu", "bell pepper", "broccoli", "brown rice", "ginger", "low-sodium soy sauce"],
        cost_usd: 1.30,
        contains: ["soy"],
        supports: ["diabetic", "vegan", "heart", "budget"],
        rationale: "Plant protein with low-sodium seasoning.",
    },
    {
        name: "Black-bean burrito bowl",
        slot: "lunch",
        ingredients: ["black beans", "brown rice", "corn", "salsa", "avocado"],
        cost_usd: 0.90,
        contains: [],
        supports: ["diabetic", "vegan", "budget", "high-fiber", "iron"],
        rationale: "Beans + whole grain = slow carbs and plant protein.",
    },
    {
        name: "Baked salmon + sweet potato + greens",
        slot: "dinner",
        ingredients: ["salmon", "sweet potato", "kale", "olive oil"],
        cost_usd: 3.00,
        contains: ["fish"],
        supports: ["heart", "diabetic"],
        rationale: "Omega-3s lower triglycerides; sweet potato is a low-GI carb.",
    },
];

function allergenCanonicals(profileAllergies: string[]): Set<string> {
    const set = new Set<string>();
    for (const a of profileAllergies) {
        const lower = a.toLowerCase();
        if (["peanut", "peanuts", "groundnut"].includes(lower)) set.add("peanut");
        else if (["tree nut", "tree nuts", "almond", "cashew", "walnut", "hazelnut", "pecan", "pistachio"].includes(lower)) set.add("tree nut");
        else if (["milk", "dairy", "lactose", "whey", "casein"].includes(lower)) set.add("milk");
        else if (["gluten", "wheat", "barley", "rye", "malt"].includes(lower)) set.add("gluten");
        else if (["soy", "soya", "soybean"].includes(lower)) set.add("soy");
        else if (["egg", "eggs"].includes(lower)) set.add("egg");
        else if (["fish"].includes(lower)) set.add("fish");
        else if (["shellfish", "shrimp", "prawn", "crab", "lobster"].includes(lower)) set.add("shellfish");
        else set.add(lower);
    }
    return set;
}

export function generateMealPlan(input: {
    profile: HealthProfile;
    budget: number | undefined;
    cartSummary: string | undefined;
    demoMode: boolean;
}): MealPlanResponse {
    const allergens = allergenCanonicals(input.profile.allergies);

    const eligible = TEMPLATES.filter((t) => {
        if (t.contains.some((c) => allergens.has(c))) return false;
        if (input.budget !== undefined && t.cost_usd > input.budget) return false;
        if (input.profile.dietary_constraints.some((d) => d.toLowerCase().includes("vegan")) && !t.supports.includes("vegan")) return false;
        return true;
    });

    // Rank by alignment with the profile's health concerns.
    const score = (t: Template): number => {
        let s = 0;
        if (input.profile.blood_sugar.diabetic || input.profile.blood_sugar.prediabetic) {
            if (t.supports.includes("diabetic")) s += 5;
        }
        if (input.profile.cholesterol.level === "high" || input.profile.cholesterol.level === "moderate") {
            if (t.supports.includes("heart")) s += 4;
        }
        if (input.profile.sodium_sensitivity === "high" && t.supports.includes("low-sodium")) s += 3;
        if (input.profile.deficiencies.some((d) => d.includes("iron")) && t.supports.includes("iron")) s += 3;
        if (input.budget !== undefined && input.budget <= 1.5 && t.supports.includes("budget")) s += 2;
        return s;
    };

    const ranked = [...eligible].sort((a, b) => score(b) - score(a));

    // Try to diversify across slots (breakfast / lunch / dinner).
    const picked: Template[] = [];
    const usedSlots = new Set<string>();
    for (const t of ranked) {
        if (picked.length >= 3) break;
        if (!usedSlots.has(t.slot)) {
            picked.push(t);
            usedSlots.add(t.slot);
        }
    }
    // If fewer than 3 unique slots, fill any remaining from top-ranked.
    for (const t of ranked) {
        if (picked.length >= 3) break;
        if (!picked.includes(t)) picked.push(t);
    }

    const meals: MealIdea[] = picked.map((t) => ({
        name: t.name,
        slot: t.slot,
        ingredients: t.ingredients,
        est_cost_usd_per_serving: t.cost_usd,
        rationale: t.rationale,
    }));

    const notes = meals.length === 0
        ? "No meals fit your allergies + budget. Relax the budget or contact a clinician."
        : `${meals.length} idea${meals.length === 1 ? "" : "s"} filtered by allergies${input.budget !== undefined ? ` and budget ≤ $${input.budget.toFixed(2)}/serving` : ""}.`;

    return {
        meals,
        source: "heuristic",
        demoMode: input.demoMode,
        notes,
    };
}
