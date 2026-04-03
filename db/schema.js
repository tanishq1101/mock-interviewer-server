import { pgTable, serial, text, integer, timestamp, real, varchar } from "drizzle-orm/pg-core";

// ── Interviews table ──────────────────────────────────
export const interviews = pgTable("interviews", {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    role: varchar("role", { length: 200 }).notNull(),
    level: varchar("level", { length: 100 }).notNull(),
    techStack: text("tech_stack").notNull(),
    interviewType: varchar("interview_type", { length: 50 }).default("technical"),
    status: varchar("status", { length: 20 }).default("active").notNull(),
    overallScore: real("overall_score"),
    verdict: varchar("verdict", { length: 100 }),
    summary: text("summary"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
});

// ── Interview Questions table ─────────────────────────
export const interviewQuestions = pgTable("interview_questions", {
    id: serial("id").primaryKey(),
    interviewId: integer("interview_id").notNull().references(() => interviews.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    userAnswer: text("user_answer"),
    evaluation: text("evaluation"),
    score: integer("score"),
    recordingMethod: varchar("recording_method", { length: 20 }).default("text"),
    answeredAt: timestamp("answered_at").defaultNow(),
});

// ── User Answer Recordings (speech-to-text) ──────────
export const userAnswerRecordings = pgTable("user_answer_recordings", {
    id: serial("id").primaryKey(),
    questionId: integer("question_id").notNull().references(() => interviewQuestions.id, { onDelete: "cascade" }),
    transcript: text("transcript"),
    recordingMethod: varchar("recording_method", { length: 20 }).default("mic"),
    createdAt: timestamp("created_at").defaultNow(),
});
