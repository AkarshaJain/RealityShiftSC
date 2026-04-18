import type { CartUpdateItem } from "../schemas/cart.js";

// Ephemeral, per-process in-memory store. Fine for MVP.
// Replaceable with SQLite behind the same interface later.

type CartRecord = {
    sessionId: string;
    items: CartUpdateItem[];
    runningScore: number;
    updatedAt: number;
};

const carts = new Map<string, CartRecord>();

export const cartStore = {
    get(sessionId: string): CartRecord {
        let rec = carts.get(sessionId);
        if (!rec) {
            rec = { sessionId, items: [], runningScore: 100, updatedAt: Date.now() };
            carts.set(sessionId, rec);
        }
        return rec;
    },
    set(rec: CartRecord): void {
        rec.updatedAt = Date.now();
        carts.set(rec.sessionId, rec);
    },
    reset(sessionId: string): CartRecord {
        const fresh: CartRecord = { sessionId, items: [], runningScore: 100, updatedAt: Date.now() };
        carts.set(sessionId, fresh);
        return fresh;
    },
    size(): number {
        return carts.size;
    },
};
