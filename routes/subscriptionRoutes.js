import express from "express";
import { db } from "../db/index.js";
import { subscriptions, interviews } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";

const router = express.Router();

// Helper to count interviews for a user
async function getInterviewCount(userId) {
    if (!db) return 0;
    try {
        const rows = await db
            .select({ count: sql`count(*)` })
            .from(interviews)
            .where(eq(interviews.userId, userId));
        return parseInt(rows[0]?.count || 0);
    } catch (err) {
        console.error("[SUB] Error counting interviews:", err.message);
        return 0;
    }
}

// ── GET /api/subscription — Retrieve user subscription details ──
router.get("/subscription", async (req, res) => {
    // Read userId from auth header (populated by Clerk middleware) or query/body
    const userId = req.auth?.userId || req.query.userId;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized: userId is required" });
    }

    const count = await getInterviewCount(userId);

    if (!db) {
        return res.json({
            plan: "free",
            billingPeriod: null,
            status: "active",
            interviewCount: count,
            limit: 10,
            dbConfigured: false
        });
    }

    try {
        const [sub] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.userId, userId));

        if (!sub) {
            return res.json({
                plan: "free",
                billingPeriod: null,
                status: "active",
                interviewCount: count,
                limit: 10
            });
        }

        res.json({
            plan: sub.plan, // 'free', 'pro', 'promax'
            billingPeriod: sub.billingPeriod, // 'monthly', 'quarterly'
            status: sub.status, // 'active', 'canceled'
            interviewCount: count,
            limit: sub.plan === "free" ? 10 : Infinity,
            updatedAt: sub.updatedAt
        });
    } catch (err) {
        console.error("[SUB] Error fetching subscription:", err.message);
        res.status(500).json({ error: "Failed to fetch subscription details" });
    }
});

// ── POST /api/subscription/simulate — Sandbox simulation endpoint ──
router.post("/subscription/simulate", async (req, res) => {
    const userId = req.auth?.userId || req.body.userId;
    const { plan, billingPeriod } = req.body;

    if (!userId) {
        return res.status(401).json({ error: "Unauthorized: userId is required" });
    }

    if (!["free", "pro", "promax"].includes(plan)) {
        return res.status(400).json({ error: "Invalid plan type" });
    }

    if (!db) {
        return res.status(503).json({ error: "Database not configured" });
    }

    try {
        // Upsert subscription
        await db
            .insert(subscriptions)
            .values({
                userId,
                plan,
                billingPeriod: billingPeriod || null,
                status: "active",
                updatedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: subscriptions.userId,
                set: {
                    plan,
                    billingPeriod: billingPeriod || null,
                    status: "active",
                    updatedAt: new Date(),
                },
            });

        console.log(`[SUB] Simulated subscription updated for user ${userId}: ${plan}`);
        const count = await getInterviewCount(userId);

        res.json({
            success: true,
            plan,
            billingPeriod,
            status: "active",
            interviewCount: count,
            limit: plan === "free" ? 10 : Infinity,
        });
    } catch (err) {
        console.error("[SUB] Simulation failed:", err.message);
        res.status(500).json({ error: "Failed to simulate subscription upgrade" });
    }
});

// Price mappings to simplify webhook processing
const PRICE_MAP = {
    "price_1TduQwSpIGV9lcjblYf8viEL": { plan: "pro", billingPeriod: "monthly" },
    "price_1TduR3SpIGV9lcjbE4WgIA8T": { plan: "pro", billingPeriod: "quarterly" },
    "price_1TduRASpIGV9lcjb8oaKoFLJ": { plan: "promax", billingPeriod: "monthly" },
    "price_1TduRFSpIGV9lcjbUMlMhXo2": { plan: "promax", billingPeriod: "quarterly" },
};

// ── POST /api/webhooks/stripe — Handle Stripe checkout hook ──
router.post("/webhooks/stripe", async (req, res) => {
    // In production, verify signatures using process.env.STRIPE_WEBHOOK_SECRET.
    // In this sandbox environment, we allow parsing direct payloads to make it easy to trigger via mock events.
    const payload = req.body;
    let event = payload;

    console.log(`[STRIPE WEBHOOK] Received webhook event: ${event.type || "unknown"}`);

    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const userId = session.client_reference_id;
        
        // Find line items or product from the event metadata/description
        // We can get price ID from line_items or session
        // Note: For payment links, the price ID is typically returned under line items.
        // If not present in the payload directly, we lookup from metadata or default to pro monthly.
        const priceId = session.line_items?.data?.[0]?.price?.id || session.metadata?.price_id;
        
        console.log(`[STRIPE WEBHOOK] Processing checkout for user: ${userId}, price: ${priceId}`);

        if (userId) {
            let plan = "pro";
            let billingPeriod = "monthly";

            if (priceId && PRICE_MAP[priceId]) {
                plan = PRICE_MAP[priceId].plan;
                billingPeriod = PRICE_MAP[priceId].billingPeriod;
            } else {
                // Check if session contains indications of pro max
                if (session.amount_total === 89900 || session.amount_total === 220000) {
                    plan = "promax";
                }
                if (session.amount_total === 100000 || session.amount_total === 220000) {
                    billingPeriod = "quarterly";
                }
            }

            if (db) {
                try {
                    await db
                        .insert(subscriptions)
                        .values({
                            userId,
                            plan,
                            billingPeriod,
                            status: "active",
                            updatedAt: new Date(),
                        })
                        .onConflictDoUpdate({
                            target: subscriptions.userId,
                            set: {
                                plan,
                                billingPeriod,
                                status: "active",
                                updatedAt: new Date(),
                            },
                        });
                    console.log(`[STRIPE WEBHOOK] Subscription successfully updated in DB for user ${userId} -> ${plan}`);
                } catch (dbErr) {
                    console.error("[STRIPE WEBHOOK] Database write error:", dbErr.message);
                }
            } else {
                console.warn("[STRIPE WEBHOOK] Database not available to persist subscription");
            }
        } else {
            console.warn("[STRIPE WEBHOOK] Missing client_reference_id in Stripe checkout session");
        }
    }

    res.json({ received: true });
});

export default router;
