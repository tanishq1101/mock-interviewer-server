import express from "express";
import { startInterview } from "../agents/interviewAgent.js";
import { evaluateAnswer } from "../agents/evaluationAgent.js";
import { generateReport } from "../agents/reportAgent.js";
import { db } from "../db/index.js";
import { interviews, interviewQuestions } from "../db/schema.js";
import { eq } from "drizzle-orm";

const router = express.Router();
const isDev = process.env.NODE_ENV !== "production";

// ── Helpers ───────────────────────────────────────────
function validateString(val, name, maxLen = 500) {
    if (!val || typeof val !== "string" || !val.trim()) {
        return `${name} is required and must be a non-empty string`;
    }
    if (val.length > maxLen) {
        return `${name} must be under ${maxLen} characters`;
    }
    return null;
}

function devError(res, status, publicMsg, err) {
    console.error(`[ERROR] ${publicMsg}:`, err?.message || err);
    res.status(status).json({
        error: publicMsg,
        ...(isDev && {
            message: err?.message,
            stack: err?.stack,
        }),
    });
}

// ── POST /api/start — Start a new interview ──────────
router.post("/start", async (req, res) => {
    const { role, level, techStack, interviewType, userId } = req.body;

    const errs = [
        validateString(role, "role", 100),
        validateString(level, "level", 100),
        validateString(techStack, "techStack", 300),
    ].filter(Boolean);

    if (errs.length) {
        return res.status(400).json({ error: errs.join("; ") });
    }

    try {
        const start = Date.now();
        const question = await startInterview(role.trim(), level.trim(), techStack.trim(), interviewType || "technical");
        console.log(`[START] Generated in ${Date.now() - start}ms`);

        // Save to database if available
        let interviewId = null;
        if (db && userId) {
            try {
                const [row] = await db.insert(interviews).values({
                    userId,
                    role: role.trim(),
                    level: level.trim(),
                    techStack: techStack.trim(),
                    interviewType: interviewType || "technical",
                    status: "active",
                }).returning();
                interviewId = row.id;
                console.log(`[DB] Interview ${interviewId} created`);

                // Save first question
                await db.insert(interviewQuestions).values({
                    interviewId,
                    question,
                });
            } catch (dbErr) {
                console.warn("[DB] Failed to save interview:", dbErr.message);
            }
        }

        res.json({ question, interviewId });
    } catch (err) {
        devError(res, 500, "Failed to start interview", err);
    }
});

// ── POST /api/answer — Submit answer, get eval + next ─
router.post("/answer", async (req, res) => {
    const { role, level, techStack, question, answer, history, interviewId, recordingMethod } = req.body;

    const errs = [
        validateString(question, "question", 2000),
        validateString(answer, "answer", 5000),
    ].filter(Boolean);

    if (errs.length) {
        return res.status(400).json({ error: errs.join("; ") });
    }

    if (history && !Array.isArray(history)) {
        return res.status(400).json({ error: "history must be an array" });
    }

    try {
        const start = Date.now();
        const result = await evaluateAnswer(
            role || "", level || "", techStack || "",
            question.trim(), answer.trim(), history || []
        );
        console.log(`[ANSWER] Evaluated in ${Date.now() - start}ms`);

        // Save to database if available
        if (db && interviewId) {
            try {
                // Update the current question with the answer
                const existingQ = await db
                    .select()
                    .from(interviewQuestions)
                    .where(eq(interviewQuestions.interviewId, interviewId))
                    .orderBy(interviewQuestions.id);

                const lastQ = existingQ.find(q => !q.userAnswer);
                if (lastQ) {
                    await db.update(interviewQuestions)
                        .set({
                            userAnswer: answer.trim(),
                            evaluation: result.evaluation,
                            score: result.score,
                            recordingMethod: recordingMethod || "text",
                            answeredAt: new Date(),
                        })
                        .where(eq(interviewQuestions.id, lastQ.id));
                }

                // Save the next question
                if (result.nextQuestion) {
                    await db.insert(interviewQuestions).values({
                        interviewId,
                        question: result.nextQuestion,
                    });
                }
            } catch (dbErr) {
                console.warn("[DB] Failed to save answer:", dbErr.message);
            }
        }

        res.json(result);
    } catch (err) {
        devError(res, 500, "Failed to evaluate answer", err);
    }
});

// ── POST /api/end — End interview, get final report ──
router.post("/end", async (req, res) => {
    const { role, level, techStack, history, interviewId } = req.body;

    if (!history || !Array.isArray(history) || history.length === 0) {
        return res.status(400).json({ error: "Interview history is required and must be a non-empty array" });
    }

    try {
        const start = Date.now();
        const report = await generateReport(
            role || "", level || "", techStack || "", history
        );
        console.log(`[REPORT] Generated in ${Date.now() - start}ms`);

        // Save report to database if available
        if (db && interviewId) {
            try {
                await db.update(interviews)
                    .set({
                        status: "completed",
                        overallScore: report.overallScore,
                        verdict: report.verdict,
                        summary: report.summary,
                        completedAt: new Date(),
                    })
                    .where(eq(interviews.id, interviewId));
                console.log(`[DB] Interview ${interviewId} completed`);
            } catch (dbErr) {
                console.warn("[DB] Failed to update interview:", dbErr.message);
            }
        }

        res.json({ report });
    } catch (err) {
        devError(res, 500, "Failed to generate report", err);
    }
});

export default router;
