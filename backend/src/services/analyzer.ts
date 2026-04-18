import type { HealthProfile } from "../schemas/profile.js";
import type {
    AnalyzeLabelResponse,
    CartContext,
    MacroBreakdown,
    Verdict,
} from "../schemas/analyze.js";
import { alternativesForFlags } from "./alternatives.js";

// Heuristic analyzer. Deterministic, explainable, no external calls.
//
// Inputs:
//   - ocrText: free text from a product label (ingredients + nutrition panel)
//   - profile: parsed HealthProfile
//   - productName: optional, improves reason text
//   - cart: optional, for running tally
//
// Output: the strict response shape required by the spec.

const ALLERGEN_CANONICALS: Record<string, string[]> = {
    peanut: ["peanut", "peanuts", "groundnut"],
    "tree nut": ["tree nut", "tree nuts", "almond", "cashew", "walnut", "hazelnut", "pecan", "pistachio", "macadamia"],
    milk: ["milk", "dairy", "lactose", "whey", "casein", "butter", "cream"],
    gluten: ["gluten", "wheat", "barley", "rye", "malt"],
    soy: ["soy", "soya", "soybean", "soy lecithin"],
    egg: ["egg", "eggs", "albumin"],
    fish: ["fish", "anchovy", "tuna", "cod"],
    shellfish: ["shellfish", "shrimp", "prawn", "crab", "lobster"],
    sesame: ["sesame", "tahini"],
};

function extractNumberWithUnit(text: string, keywords: string[], unit: RegExp): number | null {
    const lower = text.toLowerCase();
    for (const kw of keywords) {
        const idx = lower.indexOf(kw);
        if (idx === -1) continue;
        const window = text.slice(idx, Math.min(text.length, idx + 60));
        const m = window.match(unit);
        if (m && m[1]) {
            const n = parseFloat(m[1]);
            if (Number.isFinite(n)) return n;
        }
    }
    return null;
}

function extractMacros(text: string): MacroBreakdown {
    const kcal = extractNumberWithUnit(text, ["calories", "energy"], /(\d+(?:\.\d+)?)\s*(?:kcal|cal)?/i);
    const protein = extractNumberWithUnit(text, ["protein"], /(\d+(?:\.\d+)?)\s*g/i);
    const carbs = extractNumberWithUnit(text, ["carbohydrate", "total carbohydrate", "carbs"], /(\d+(?:\.\d+)?)\s*g/i);
    const fat = extractNumberWithUnit(text, ["total fat", "fat"], /(\d+(?:\.\d+)?)\s*g/i);
    const sugar = extractNumberWithUnit(text, ["sugar", "sugars", "total sugars", "added sugar"], /(\d+(?:\.\d+)?)\s*g/i);
    const sodium = extractNumberWithUnit(text, ["sodium", "salt"], /(\d+(?:\.\d+)?)\s*mg/i);

    const fmtG = (n: number | null) => (n === null ? "unknown" : `${n} g`);
    const fmtMg = (n: number | null) => (n === null ? "unknown" : `${n} mg`);
    const fmtKcal = (n: number | null) => (n === null ? "unknown" : `${Math.round(n)} kcal`);

    return {
        calories: fmtKcal(kcal),
        protein: fmtG(protein),
        carbs: fmtG(carbs),
        fat: fmtG(fat),
        sugar: fmtG(sugar),
        sodium: fmtMg(sodium),
    };
}

type Finding = { flag: string; risk: string; score: number };

function findAllergenHits(text: string, profileAllergies: string[]): Finding[] {
    const lower = text.toLowerCase();
    const findings: Finding[] = [];
    for (const profileTerm of profileAllergies.map((a) => a.toLowerCase())) {
        let canonical: string | null = null;
        for (const [canon, variants] of Object.entries(ALLERGEN_CANONICALS)) {
            if (variants.includes(profileTerm) || canon === profileTerm) {
                canonical = canon;
                break;
            }
        }
        const variantsToCheck = canonical ? ALLERGEN_CANONICALS[canonical] : [profileTerm];
        for (const v of variantsToCheck) {
            if (lower.includes(v)) {
                findings.push({
                    flag: `allergen: ${canonical ?? profileTerm}`,
                    risk: `Contains ${canonical ?? profileTerm}, which is in your allergy profile.`,
                    score: 100,
                });
                break;
            }
        }
    }
    return findings;
}

function findNutritionFindings(
    text: string,
    macros: MacroBreakdown,
    profile: HealthProfile,
): Finding[] {
    const findings: Finding[] = [];
    const lower = text.toLowerCase();

    const sugarG = parseFloat(macros.sugar);
    if (Number.isFinite(sugarG) && sugarG >= 15) {
        const score = profile.sugar_sensitivity === "high" ? 60 : profile.sugar_sensitivity === "moderate" ? 40 : 20;
        findings.push({
            flag: `high sugar (${sugarG} g)`,
            risk: profile.sugar_sensitivity === "high"
                ? "Likely to spike blood sugar — risky for your diabetic profile."
                : "High sugar content.",
            score,
        });
    }

    const sodiumMg = parseFloat(macros.sodium);
    if (Number.isFinite(sodiumMg) && sodiumMg >= 480) {
        const score = profile.sodium_sensitivity === "high" ? 50 : 25;
        findings.push({
            flag: `high sodium (${sodiumMg} mg)`,
            risk: profile.sodium_sensitivity === "high"
                ? "Too much sodium for your blood-pressure profile."
                : "Sodium exceeds 20% of a 2300 mg daily cap per serving.",
            score,
        });
    }

    if (/hydrogenated|trans fat/.test(lower)) {
        const score = profile.cholesterol.level === "high" || profile.cholesterol.level === "moderate" ? 50 : 30;
        findings.push({
            flag: "trans fat / hydrogenated oil",
            risk: "Trans fats raise LDL cholesterol and harm heart health.",
            score,
        });
    }

    if (/high fructose corn syrup|hfcs/.test(lower)) {
        findings.push({
            flag: "added sugar: HFCS",
            risk: "High fructose corn syrup is a refined added sugar.",
            score: profile.sugar_sensitivity === "high" ? 40 : 20,
        });
    }

    if (/aspartame|sucralose|acesulfame|saccharin/.test(lower)) {
        findings.push({
            flag: "artificial sweetener",
            risk: "Artificial sweeteners — informational; mixed evidence on long-term effects.",
            score: 5,
        });
    }

    if (/enriched (?:white )?flour|refined flour|refined grain/.test(lower)) {
        findings.push({
            flag: "refined carb",
            risk: "Refined grains lack fiber and raise glucose faster than whole grains.",
            score: profile.sugar_sensitivity === "high" ? 25 : 10,
        });
    }

    return findings;
}

function verdictFromScore(score: number): Verdict {
    if (score >= 70) return "Avoid";
    if (score >= 30) return "Caution";
    return "Safe";
}

function shortReason(
    verdict: Verdict,
    productName: string | undefined,
    findings: Finding[],
): string {
    const name = productName?.trim() ? productName : "This product";
    if (findings.length === 0) return `${name} looks safe for your profile.`;
    const top = findings[0];
    if (verdict === "Avoid") return `${name}: avoid — ${top.flag}.`;
    if (verdict === "Caution") return `${name}: caution — ${top.flag}.`;
    return `${name} is mostly safe; minor note: ${top.flag}.`;
}

function cartImpact(
    verdict: Verdict,
    cart: CartContext | undefined,
): { summary: string; running_score: string } {
    const prevScore = cart?.running_score ?? 100;
    const delta = verdict === "Safe" ? +2 : verdict === "Caution" ? -10 : -25;
    const newScore = Math.max(0, Math.min(100, prevScore + delta));
    const items = cart?.items ?? [];
    const counts = {
        Safe: items.filter((i) => i.verdict === "Safe").length + (verdict === "Safe" ? 1 : 0),
        Caution: items.filter((i) => i.verdict === "Caution").length + (verdict === "Caution" ? 1 : 0),
        Avoid: items.filter((i) => i.verdict === "Avoid").length + (verdict === "Avoid" ? 1 : 0),
    };
    const summary = `Cart: ${counts.Safe} safe / ${counts.Caution} caution / ${counts.Avoid} avoid`;
    return { summary, running_score: `${newScore}/100` };
}

function mealHint(verdict: Verdict, profile: HealthProfile): string {
    if (profile.blood_sugar.diabetic) {
        return "Pair with leafy greens + a lean protein to blunt any glucose bump.";
    }
    if (profile.sodium_sensitivity === "high") {
        return "Balance with a potassium-rich side like banana or spinach.";
    }
    if (verdict === "Avoid") {
        return "Skip this; build a meal around whole grains + beans + vegetables instead.";
    }
    return "Keep portions modest; add a fibrous side for balance.";
}

export function analyzeLabel(input: {
    ocrText: string;
    profile: HealthProfile;
    productName?: string;
    cart?: CartContext;
}): Omit<AnalyzeLabelResponse, "source" | "demoMode"> {
    const text = input.ocrText || "";
    const macros = extractMacros(text);

    const allergenFindings = findAllergenHits(text, input.profile.allergies);
    const nutritionFindings = findNutritionFindings(text, macros, input.profile);
    const findings = [...allergenFindings, ...nutritionFindings].sort((a, b) => b.score - a.score);

    const score = findings.reduce((s, f) => s + f.score, 0);
    const verdict = verdictFromScore(score);

    const ingredientsFlags = findings.map((f) => f.flag).slice(0, 6);
    const healthRisks = findings.map((f) => f.risk).slice(0, 4);
    const alternatives = verdict === "Safe" ? [] : alternativesForFlags(ingredientsFlags, 3);

    return {
        verdict,
        reason: shortReason(verdict, input.productName, findings),
        ingredients_flags: ingredientsFlags,
        macro_breakdown: macros,
        health_risks: healthRisks,
        better_alternatives: alternatives,
        cart_impact: cartImpact(verdict, input.cart),
        meal_plan_hint: mealHint(verdict, input.profile),
    };
}
