import express from "express";
import { startInterview, getInterviewerForStep } from "../agents/interviewAgent.js";
import { evaluateAnswer } from "../agents/evaluationAgent.js";
import { generateReport } from "../agents/reportAgent.js";
import { db } from "../db/index.js";
import { interviews, interviewQuestions, subscriptions, userAnswerRecordings } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { checkAuth, requireOwnership } from "../middleware/authMiddleware.js";
import { apiRateLimiter } from "../middleware/rateLimitMiddleware.js";
import { groq } from "../services/groqService.js";
import Groq from "groq-sdk";

const router = express.Router();
const isDev = process.env.NODE_ENV !== "production";

// Rate limiters for specific actions
const startLimiter = apiRateLimiter(5, 15 * 60 * 1000); // 5 starts per 15 min
const interviewLimiter = apiRateLimiter(50, 15 * 60 * 1000); // 50 answers/transcribes per 15 min

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
router.post("/start", startLimiter, checkAuth, async (req, res) => {
    const userId = req.authenticatedUserId;
    const { role, level, techStack, interviewType, resumeText } = req.body;

    const errs = [
        validateString(role, "role", 100),
        validateString(level, "level", 100),
        validateString(techStack, "techStack", 300),
    ].filter(Boolean);

    if (errs.length) {
        return res.status(400).json({ error: errs.join("; ") });
    }

    try {
        if (db && userId) {
            // Check subscription plan & limits
            const [sub] = await db
                .select()
                .from(subscriptions)
                .where(eq(subscriptions.userId, userId));
            
            const plan = sub?.plan || "free";

            if (plan === "free") {
                const rows = await db
                    .select({ count: sql`count(*)` })
                    .from(interviews)
                    .where(
                        sql`${interviews.userId} = ${userId} AND ${interviews.status} = 'completed'`
                    );
                const count = parseInt(rows[0]?.count || 0);

                if (count >= 10) {
                    return res.status(402).json({
                        error: "limit_reached",
                        message: "You have reached the limit of 10 free mock interviews. Please upgrade to Pro or Pro Max to practice unlimited sessions."
                    });
                }
            }
        }

        const start = Date.now();
        const question = await startInterview(role.trim(), level.trim(), techStack.trim(), interviewType || "technical", resumeText || "");
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

        const interviewer = getInterviewerForStep(0, interviewType || "technical");
        res.json({ question, interviewId, interviewer });
    } catch (err) {
        devError(res, 500, "Failed to start interview", err);
    }
});

// ── POST /api/answer — Submit answer, get eval + next ─
router.post("/answer", interviewLimiter, requireOwnership, async (req, res) => {
    const { role, level, techStack, question, answer, history, interviewId, recordingMethod, code, codeLanguage } = req.body;

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

    const interviewType = req.interview?.interviewType || req.body.interviewType || "technical";

    try {
        const start = Date.now();
        const result = await evaluateAnswer(
            role || "", level || "", techStack || "",
            question.trim(), answer.trim(), history || [],
            code || "", codeLanguage || "", interviewType
        );
        console.log(`[ANSWER] Evaluated in ${Date.now() - start}ms`);

        const nextInterviewer = getInterviewerForStep((history || []).length + 1, interviewType);
        result.interviewer = nextInterviewer;

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
                    const answerWithCode = code && code.trim() 
                        ? `${answer.trim()}\n\n\`\`\`${codeLanguage || "javascript"}\n${code.trim()}\n\`\`\``
                        : answer.trim();

                    await db.update(interviewQuestions)
                        .set({
                            userAnswer: answerWithCode,
                            evaluation: result.evaluation,
                            score: result.score,
                            recordingMethod: recordingMethod || "text",
                            answeredAt: new Date(),
                        })
                        .where(eq(interviewQuestions.id, lastQ.id));

                    // Save voice transaction details if applicable
                    if (recordingMethod === "mic" || recordingMethod === "audio") {
                        await db.insert(userAnswerRecordings).values({
                            questionId: lastQ.id,
                            transcript: answer.trim(),
                            recordingMethod: recordingMethod,
                        });
                        console.log(`[DB] Logged userAnswerRecording for question ${lastQ.id}`);
                    }
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
router.post("/end", requireOwnership, async (req, res) => {
    const { role, level, techStack, history, interviewId } = req.body;

    if (!history || !Array.isArray(history) || history.length === 0) {
        return res.status(400).json({ error: "Interview history is required and must be a non-empty array" });
    }

    const interviewType = req.interview?.interviewType || req.body.interviewType || "technical";

    try {
        const start = Date.now();
        const report = await generateReport(
            role || "", level || "", techStack || "", history, interviewType
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
                        reportJson: report,
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

// ── POST /api/transcribe — Transcribe audio answers ──
router.post("/transcribe", interviewLimiter, checkAuth, async (req, res) => {
    const { audio, mimeType } = req.body;
    if (!audio) {
        return res.status(400).json({ error: "Audio data is required" });
    }
    if (!groq) {
        return res.status(503).json({ error: "Groq service is not configured on the server" });
    }
    try {
        const buffer = Buffer.from(audio, "base64");
        const file = await Groq.toFile(buffer, "audio.webm", { type: mimeType || "audio/webm" });
        const transcription = await groq.audio.transcriptions.create({
            file: file,
            model: "whisper-large-v3",
        });
        res.json({ text: transcription.text });
    } catch (err) {
        console.error("[TRANSCRIBE] Error during transcription:", err.message);
        res.status(500).json({ error: "Failed to transcribe audio. Make sure GROQ_API_KEY is configured." });
    }
});

export default router;
