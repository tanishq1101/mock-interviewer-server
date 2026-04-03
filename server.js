import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import interviewRoutes from "./routes/interviewRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";

dotenv.config();

const app = express();
const isDev = process.env.NODE_ENV !== "production";

// ── CORS ──────────────────────────────────────────────
const defaultOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
];
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : defaultOrigins;

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "DELETE"],
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

// ── Request logger (dev only) ─────────────────────────
if (isDev) {
  app.use((req, _res, next) => {
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`[${ts}] ${req.method} ${req.url}`);
    next();
  });
}

// ── Health check ──────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ── Routes ────────────────────────────────────────────
app.use("/api", interviewRoutes);
app.use("/api/dashboard", dashboardRoutes);

// ── Global error handler ──────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    ...(isDev && { message: err.message, stack: err.stack }),
  });
});

// ── Process-level safety nets ─────────────────────────
process.on("unhandledRejection", (reason, promise) => {
  console.error("⚠ Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err);
  process.exit(1);
});

// ── Start ─────────────────────────────────────────────
const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`\n🚀 InterviewAI backend running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
});