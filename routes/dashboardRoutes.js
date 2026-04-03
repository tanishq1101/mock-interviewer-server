import express from "express";
import { db } from "../db/index.js";
import { interviews, interviewQuestions } from "../db/schema.js";
import { desc, eq } from "drizzle-orm";
import { requireOwnership } from "../middleware/authMiddleware.js";

const router = express.Router();

// Apply ownership middleware to all dashboard routes
router.use(requireOwnership);

// ── GET /api/dashboard — List all interviews for a user ──
router.get("/", async (req, res) => {
    const userId = req.authenticatedUserId;
    if (!db) return res.status(503).json({ error: "Database not configured" });

    try {
        const result = await db
            .select()
            .from(interviews)
            .where(eq(interviews.userId, userId))
            .orderBy(desc(interviews.createdAt));

        res.json({ interviews: result });
    } catch (err) {
        console.error("[DASHBOARD] Error fetching interviews:", err.message);
        res.status(500).json({ error: "Failed to fetch interviews" });
    }
});

// ── GET /api/dashboard/:id — Get full interview with questions ──
// Ownership is already verified by middleware; interview is on req.interview
router.get("/:id", async (req, res) => {
    const { id } = req.params;
    if (!db) return res.status(503).json({ error: "Database not configured" });

    try {
        const interview = req.interview;

        const questions = await db
            .select()
            .from(interviewQuestions)
            .where(eq(interviewQuestions.interviewId, parseInt(id)))
            .orderBy(interviewQuestions.answeredAt);

        res.json({ interview, questions });
    } catch (err) {
        console.error("[DASHBOARD] Error fetching interview:", err.message);
        res.status(500).json({ error: "Failed to fetch interview" });
    }
});

// ── DELETE /api/dashboard/:id — Delete an interview ──
// Ownership is already verified by middleware
router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    if (!db) return res.status(503).json({ error: "Database not configured" });

    try {
        await db.delete(interviews).where(eq(interviews.id, parseInt(id)));
        res.json({ success: true });
    } catch (err) {
        console.error("[DASHBOARD] Error deleting interview:", err.message);
        res.status(500).json({ error: "Failed to delete interview" });
    }
});

export default router;
