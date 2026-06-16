import { db } from "../db/index.js";
import { interviews } from "../db/schema.js";
import { eq } from "drizzle-orm";

/**
 * Enforces Clerk authentication.
 * If CLERK_SECRET_KEY is missing, runs in INSECURE mode and falls back to client-supplied userId or a dummy user.
 */
export function checkAuth(req, res, next) {
    if (!process.env.CLERK_SECRET_KEY) {
        req.authenticatedUserId = req.query.userId || req.body?.userId || "insecure_user";
        return next();
    }

    if (!req.auth?.userId) {
        return res.status(401).json({ error: "Unauthorized: Clerk authentication is required" });
    }

    req.authenticatedUserId = req.auth.userId;
    next();
}

/**
 * Middleware to verify interview ownership.
 * Ensures the authenticated user matches the interview's userId.
 */
export async function requireOwnership(req, res, next) {
    if (!req.authenticatedUserId) {
        checkAuth(req, res, (err) => {
            if (err) return next(err);
            verifyOwnership();
        });
    } else {
        verifyOwnership();
    }

    async function verifyOwnership() {
        const userId = req.authenticatedUserId;
        const interviewId = req.params.id || req.body?.interviewId;

        if (!userId) {
            return res.status(401).json({ error: "userId is required for authentication" });
        }

        if (!interviewId) {
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

            req.interview = interview;
            next();
        } catch (err) {
            console.error("[AUTH] Ownership check failed:", err.message);
            res.status(500).json({ error: "Authentication check failed" });
        }
    }
}
