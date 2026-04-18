import type { Alternative } from "../schemas/analyze.js";

// Tiny static catalog of generic, brand-neutral alternatives keyed to risk flags.
// Not a real product database — just enough to return useful suggestions on-device.
// Layer 5 can replace this with OpenFoodFacts lookups behind the same interface.

type Rule = {
    // A flag substring (case-insensitive) that activates this rule.
    match: string;
    alternatives: Alternative[];
};

const RULES: Rule[] = [
    {
        match: "high sugar",
        alternatives: [
            { name: "Unsweetened Greek yogurt", why_better: "Protein-rich, no added sugar" },
            { name: "Plain rolled oats", why_better: "Slow carbs, no added sugar, lowers cholesterol" },
            { name: "Fresh whole fruit", why_better: "Natural sugars bundled with fiber" },
        ],
    },
    {
        match: "added sugar",
        alternatives: [
            { name: "Unsweetened nut butter", why_better: "No added sugar, steady energy" },
            { name: "Stevia- or erythritol-sweetened option", why_better: "Minimal blood-sugar impact" },
        ],
    },
    {
        match: "high sodium",
        alternatives: [
            { name: "Low-sodium or 'no salt added' version", why_better: "Same food, 40-60% less sodium" },
            { name: "Fresh / frozen whole vegetables", why_better: "Naturally low sodium" },
        ],
    },
    {
        match: "trans fat",
        alternatives: [
            { name: "Olive-oil-based spread or whole nuts", why_better: "Heart-healthy fats, no hydrogenated oils" },
            { name: "Air-popped popcorn", why_better: "Whole grain, no trans fats" },
        ],
    },
    {
        match: "saturated fat",
        alternatives: [
            { name: "Legume-based alternative (lentils, beans)", why_better: "Plant protein, lower saturated fat" },
        ],
    },
    {
        match: "allergen",
        alternatives: [
            { name: "Certified allergen-free alternative", why_better: "Made in dedicated allergen-free facility" },
        ],
    },
    {
        match: "artificial",
        alternatives: [
            { name: "Whole-food version with short ingredient list", why_better: "Fewer additives, more nutrients" },
        ],
    },
    {
        match: "refined carb",
        alternatives: [
            { name: "Whole-grain version", why_better: "More fiber, slower glucose response" },
        ],
    },
];

export function alternativesForFlags(flags: string[], limit: number = 3): Alternative[] {
    const picked: Alternative[] = [];
    const seenNames = new Set<string>();
    const lowerFlags = flags.map((f) => f.toLowerCase());
    for (const rule of RULES) {
        if (lowerFlags.some((f) => f.includes(rule.match))) {
            for (const alt of rule.alternatives) {
                if (!seenNames.has(alt.name)) {
                    picked.push(alt);
                    seenNames.add(alt.name);
                    if (picked.length >= limit) return picked;
                }
            }
        }
    }
    if (picked.length === 0) {
        picked.push({
            name: "Whole, minimally processed version of this category",
            why_better: "Fewer additives, closer to nature",
        });
    }
    return picked.slice(0, limit);
}
