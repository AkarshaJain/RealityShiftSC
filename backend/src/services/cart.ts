import type { CartState, CartUpdateItem } from "../schemas/cart.js";
import { cartStore } from "../store/memoryStore.js";

function scoreDeltaFor(verdict: "Safe" | "Caution" | "Avoid"): number {
    return verdict === "Safe" ? +2 : verdict === "Caution" ? -10 : -25;
}

function counts(items: CartUpdateItem[]): { Safe: number; Caution: number; Avoid: number } {
    return {
        Safe: items.filter((i) => i.verdict === "Safe").length,
        Caution: items.filter((i) => i.verdict === "Caution").length,
        Avoid: items.filter((i) => i.verdict === "Avoid").length,
    };
}

function healthTrend(runningScore: number, prevScore: number): string {
    const delta = runningScore - prevScore;
    if (delta > 0) return "improving — last pick was a win";
    if (delta === 0) return "steady";
    if (delta >= -10) return "slight dip — one caution item";
    return "declining — consider swapping an avoid item";
}

function riskAlerts(items: CartUpdateItem[]): string[] {
    const alerts: string[] = [];
    const avoidCount = items.filter((i) => i.verdict === "Avoid").length;
    if (avoidCount >= 3) alerts.push(`${avoidCount} "avoid" items — cart health is at risk`);

    // Repeated-flag pattern detection
    const flagTally = new Map<string, number>();
    for (const it of items) {
        for (const f of it.ingredients_flags) {
            flagTally.set(f, (flagTally.get(f) ?? 0) + 1);
        }
    }
    for (const [flag, n] of flagTally) {
        if (n >= 3) alerts.push(`"${flag}" appears in ${n} items — pattern alert`);
    }
    return alerts;
}

export function applyCartUpdate(
    sessionId: string,
    item: CartUpdateItem,
    reset: boolean,
): CartState {
    let rec = reset ? cartStore.reset(sessionId) : cartStore.get(sessionId);
    const prevScore = rec.runningScore;
    const newItems = [...rec.items, item];
    const delta = scoreDeltaFor(item.verdict);
    const newScore = Math.max(0, Math.min(100, prevScore + delta));

    rec = { ...rec, items: newItems, runningScore: newScore };
    cartStore.set(rec);

    const c = counts(newItems);
    return {
        session_id: sessionId,
        items: newItems,
        counts: c,
        running_score: newScore,
        summary: `${newItems.length} item${newItems.length === 1 ? "" : "s"} · ${c.Safe} safe / ${c.Caution} caution / ${c.Avoid} avoid`,
        health_trend: healthTrend(newScore, prevScore),
        risk_alerts: riskAlerts(newItems),
    };
}
