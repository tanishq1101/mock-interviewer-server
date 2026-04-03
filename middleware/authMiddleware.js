import { db } from "../db/index.js";
import { interviews } from "../db/schema.js";
import { eq } from "drizzle-orm";

/**
 * Middleware to verify interview ownership.
 * Ensures the requesting userId matches the interview's userId.
 */
export async function requireOwnership(req, res, next) {
    const userId = req.query.userId || req.body?.userId;
    const interviewId = req.params.id;

    if (!userId) {
        return res.status(401).json({ error: "userId is required for authentication" });
    }

    if (!interviewId) {
        // For list endpoints, userId alone is sufficient
        req.authenticatedUserId = userId;
        return next();
    }

    if (!db) {
        return res.status(503).json({ error: "Database not configured" });
    }

    try {
        const [interview] = await db
            .select()
            .from(interviews)
            .where(eq(interviews.id, parseInt(interviewId)));

        if (!interview) {
            return res.status(404).json({ error: "Interview not found" });
        }

        if (interview.userId !== userId) {
            return res.status(403).json({ error: "Not authorized to access this interview" });
        }

        req.authenticatedUserId = userId;
        req.interview = interview;
        next();
    } catch (err) {
        console.error("[AUTH] Ownership check failed:", err.message);
        res.status(500).json({ error: "Authentication check failed" });
    }
}
