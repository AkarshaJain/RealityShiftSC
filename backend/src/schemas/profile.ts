import { z } from "zod";

export const SeverityLevel = z.enum(["none", "low", "moderate", "high", "unknown"]);
export type SeverityLevel = z.infer<typeof SeverityLevel>;

export const HealthProfileSchema = z.object({
    cholesterol: z.object({
        level: SeverityLevel,
        total_mg_dl: z.number().nullable().optional(),
        ldl_mg_dl: z.number().nullable().optional(),
        hdl_mg_dl: z.number().nullable().optional(),
    }),
    blood_sugar: z.object({
        level: SeverityLevel,
        fasting_mg_dl: z.number().nullable().optional(),
        hba1c_percent: z.number().nullable().optional(),
        diabetic: z.boolean(),
        prediabetic: z.boolean(),
    }),
    allergies: z.array(z.string()),
    deficiencies: z.array(z.string()),
    sodium_sensitivity: SeverityLevel,
    sugar_sensitivity: SeverityLevel,
    dietary_constraints: z.array(z.string()),
    notes: z.string(),
});
export type HealthProfile = z.infer<typeof HealthProfileSchema>;

export const ProfileParseRequestSchema = z.object({
    text: z.string().min(1, "text must not be empty"),
});
export type ProfileParseRequest = z.infer<typeof ProfileParseRequestSchema>;

export const ProfileParseResponseSchema = z.object({
    source: z.enum(["heuristic", "demo"]),
    demoMode: z.boolean(),
    profile: HealthProfileSchema,
});
export type ProfileParseResponse = z.infer<typeof ProfileParseResponseSchema>;
