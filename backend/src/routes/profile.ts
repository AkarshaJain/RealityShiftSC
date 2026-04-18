import { Router } from "express";
import {
    ProfileParseRequestSchema,
    type ProfileParseResponse,
} from "../schemas/profile.js";
import { parseHealthProfile } from "../services/profileParser.js";
import { config } from "../util/config.js";
import { logger } from "../util/logger.js";
import { DEMO_PROFILES, type DemoProfileId } from "../demo/profiles.js";

export const profileRouter = Router();

profileRouter.post("/api/profile/parse", (req, res) => {
    const parsed = ProfileParseRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "bad_request", issues: parsed.error.issues });
    }

    const profile = parseHealthProfile(parsed.data.text);
    const resp: ProfileParseResponse = {
        source: "heuristic",
        demoMode: config.demoMode,
        profile,
    };
    logger.info("profile", "parsed", {
        chol: profile.cholesterol.level,
        sugar: profile.blood_sugar.level,
        allergies: profile.allergies.length,
    });
    res.json(resp);
});

// Demo helper: GET a prebuilt profile by id.
// Useful for the Spectacles lens to bootstrap without a real lab report.
profileRouter.get("/api/profile/demo/:id", (req, res) => {
    const id = req.params.id as DemoProfileId;
    const profile = DEMO_PROFILES[id];
    if (!profile) {
        return res.status(404).json({
            error: "unknown_demo_profile",
            valid: Object.keys(DEMO_PROFILES),
        });
    }
    const resp: ProfileParseResponse = {
        source: "demo",
        demoMode: true,
        profile,
    };
    res.json(resp);
});
