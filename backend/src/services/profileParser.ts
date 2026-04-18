import type { HealthProfile, SeverityLevel } from "../schemas/profile.js";

// Deterministic keyword-based parser. No LLM, no network.
// Picks up numeric markers + common clinical phrases from a pasted lab report.

const KNOWN_ALLERGENS = [
    "peanut", "peanuts",
    "tree nut", "tree nuts", "almond", "almonds", "cashew", "cashews", "walnut", "walnuts", "hazelnut", "pecan",
    "milk", "dairy", "lactose", "whey", "casein",
    "gluten", "wheat", "barley", "rye",
    "soy", "soya", "soybean",
    "egg", "eggs",
    "fish", "shellfish", "shrimp", "prawn", "crab", "lobster",
    "sesame",
];

const DIETARY_KEYWORDS = [
    "vegetarian", "vegan", "kosher", "halal", "keto", "low-carb", "low carb",
    "pescatarian", "gluten-free", "gluten free",
];

const DEFICIENCY_KEYWORDS = [
    "vitamin d deficiency", "vitamin d",
    "b12 deficiency", "b12",
    "iron deficiency", "iron",
    "anemia", "anaemia",
    "calcium deficiency",
    "folate",
];

function findNumberNear(text: string, keywords: string[], unitHints: RegExp[]): number | null {
    // Search for keyword, then grab the first number that appears within ~60 chars
    const lower = text.toLowerCase();
    for (const kw of keywords) {
        const idx = lower.indexOf(kw);
        if (idx === -1) continue;
        const windowText = text.slice(idx, Math.min(text.length, idx + 80));
        for (const unit of unitHints) {
            const m = windowText.match(unit);
            if (m && m[1]) {
                const n = parseFloat(m[1]);
                if (Number.isFinite(n)) return n;
            }
        }
        const anyNum = windowText.match(/(\d+(?:\.\d+)?)/);
        if (anyNum && anyNum[1]) {
            const n = parseFloat(anyNum[1]);
            if (Number.isFinite(n)) return n;
        }
    }
    return null;
}

function classifyCholesterol(totalMgDl: number | null, ldl: number | null): SeverityLevel {
    // Simplified thresholds (adult, non-pregnant). Not a medical device.
    if (totalMgDl === null && ldl === null) return "unknown";
    if ((totalMgDl ?? 0) >= 240 || (ldl ?? 0) >= 160) return "high";
    if ((totalMgDl ?? 0) >= 200 || (ldl ?? 0) >= 130) return "moderate";
    if ((totalMgDl ?? 0) > 0 && totalMgDl! < 200) return "low";
    return "unknown";
}

function classifyBloodSugar(fasting: number | null, hba1c: number | null): {
    level: SeverityLevel;
    diabetic: boolean;
    prediabetic: boolean;
} {
    let diabetic = false;
    let prediabetic = false;
    let level: SeverityLevel = "unknown";
    if (hba1c !== null) {
        if (hba1c >= 6.5) { diabetic = true; level = "high"; }
        else if (hba1c >= 5.7) { prediabetic = true; level = "moderate"; }
        else { level = "low"; }
    } else if (fasting !== null) {
        if (fasting >= 126) { diabetic = true; level = "high"; }
        else if (fasting >= 100) { prediabetic = true; level = "moderate"; }
        else { level = "low"; }
    }
    return { level, diabetic, prediabetic };
}

function collectMatches(text: string, keywords: string[]): string[] {
    const lower = text.toLowerCase();
    const found = new Set<string>();
    for (const kw of keywords) {
        if (lower.includes(kw)) found.add(kw);
    }
    return Array.from(found);
}

export function parseHealthProfile(rawText: string): HealthProfile {
    const text = rawText ?? "";
    const lower = text.toLowerCase();

    const totalChol = findNumberNear(text,
        ["total cholesterol", "cholesterol, total", "cholesterol total", "cholesterol"],
        [/(\d+(?:\.\d+)?)\s*mg\/dl/i],
    );
    const ldl = findNumberNear(text, ["ldl"], [/(\d+(?:\.\d+)?)\s*mg\/dl/i]);
    const hdl = findNumberNear(text, ["hdl"], [/(\d+(?:\.\d+)?)\s*mg\/dl/i]);

    const fasting = findNumberNear(text, ["fasting glucose", "fasting blood sugar", "glucose"], [/(\d+(?:\.\d+)?)\s*mg\/dl/i]);
    const hba1c = findNumberNear(text, ["hba1c", "a1c", "hemoglobin a1c"], [/(\d+(?:\.\d+)?)\s*%/]);

    const allergiesFound = collectMatches(lower, KNOWN_ALLERGENS);
    const dietaryFound = collectMatches(lower, DIETARY_KEYWORDS);
    const deficienciesFound = collectMatches(lower, DEFICIENCY_KEYWORDS);

    const sodiumSensitivity: SeverityLevel =
        /hypertension|high blood pressure|bp\s*elevated|sodium sensitive/i.test(text) ? "high"
        : /borderline bp|pre-?hypertension/i.test(text) ? "moderate"
        : "unknown";

    const { level: sugarLevel, diabetic, prediabetic } = classifyBloodSugar(fasting, hba1c);
    const sugarSensitivity: SeverityLevel = diabetic ? "high" : prediabetic ? "moderate" : sugarLevel === "low" ? "low" : "unknown";

    return {
        cholesterol: {
            level: classifyCholesterol(totalChol, ldl),
            total_mg_dl: totalChol,
            ldl_mg_dl: ldl,
            hdl_mg_dl: hdl,
        },
        blood_sugar: {
            level: sugarLevel,
            fasting_mg_dl: fasting,
            hba1c_percent: hba1c,
            diabetic,
            prediabetic,
        },
        allergies: allergiesFound,
        deficiencies: deficienciesFound,
        sodium_sensitivity: sodiumSensitivity,
        sugar_sensitivity: sugarSensitivity,
        dietary_constraints: dietaryFound,
        notes: text.length > 500 ? text.slice(0, 497) + "..." : text,
    };
}
