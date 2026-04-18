import { Router } from "express";
import { CartUpdateRequestSchema, type CartUpdateResponse } from "../schemas/cart.js";
import { applyCartUpdate } from "../services/cart.js";
import { config } from "../util/config.js";
import { logger } from "../util/logger.js";
import { cartStore } from "../store/memoryStore.js";

export const cartRouter = Router();

cartRouter.post("/api/cart/update", (req, res) => {
    const parsed = CartUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "bad_request", issues: parsed.error.issues });
    }
    const { session_id, item, reset } = parsed.data;
    const cart = applyCartUpdate(session_id, item, Boolean(reset));
    const resp: CartUpdateResponse = {
        cart,
        source: "heuristic",
        demoMode: config.demoMode,
    };
    logger.info("cart", `session=${session_id} items=${cart.items.length} score=${cart.running_score}`);
    res.json(resp);
});

cartRouter.get("/api/cart/:sessionId", (req, res) => {
    const rec = cartStore.get(req.params.sessionId);
    res.json({
        session_id: rec.sessionId,
        items: rec.items,
        running_score: rec.runningScore,
        source: "heuristic",
        demoMode: config.demoMode,
    });
});
