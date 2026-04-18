import type { HealthProfile } from "../schemas/profile.js";

// Labeled mock profiles for demo mode.
// These are obvious archetypes so the lens UI can show a clear "DEMO" badge.

export const DEMO_DIABETIC: HealthProfile = {
    cholesterol: { level: "moderate", total_mg_dl: 215, ldl_mg_dl: 140, hdl_mg_dl: 45 },
    blood_sugar: { level: "high", fasting_mg_dl: 148, hba1c_percent: 7.2, diabetic: true, prediabetic: false },
    allergies: [],
    deficiencies: ["vitamin d"],
    sodium_sensitivity: "moderate",
    sugar_sensitivity: "high",
    dietary_constraints: [],
    notes: "DEMO: Type 2 diabetic profile. Tight sugar control, moderate BP concern.",
};

export const DEMO_ALLERGY: HealthProfile = {
    cholesterol: { level: "low", total_mg_dl: 175, ldl_mg_dl: 100, hdl_mg_dl: 60 },
    blood_sugar: { level: "low", fasting_mg_dl: 85, hba1c_percent: 5.2, diabetic: false, prediabetic: false },
    allergies: ["peanut", "tree nut", "milk"],
    deficiencies: [],
    sodium_sensitivity: "unknown",
    sugar_sensitivity: "unknown",
    dietary_constraints: [],
    notes: "DEMO: Severe peanut + tree nut allergy, lactose intolerant.",
};

export const DEMO_BUDGET: HealthProfile = {
    cholesterol: { level: "low", total_mg_dl: 180, ldl_mg_dl: 110, hdl_mg_dl: 55 },
    blood_sugar: { level: "low", fasting_mg_dl: 92, hba1c_percent: 5.4, diabetic: false, prediabetic: false },
    allergies: [],
    deficiencies: ["iron", "b12"],
    sodium_sensitivity: "unknown",
    sugar_sensitivity: "low",
    dietary_constraints: ["low-carb"],
    notes: "DEMO: Budget-conscious household, family of four, trying to stretch groceries.",
};

export const DEMO_PROFILES = {
    diabetic: DEMO_DIABETIC,
    allergy: DEMO_ALLERGY,
    budget: DEMO_BUDGET,
} as const;

export type DemoProfileId = keyof typeof DEMO_PROFILES;
