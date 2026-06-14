import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { clerkMiddleware } from "@clerk/express";
import interviewRoutes from "./routes/interviewRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";

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

// ── Serverless Body Parser Fix ────────────────────────
app.use((req, res, next) => {
  if (req.apiGateway && req.apiGateway.event) {
    const event = req.apiGateway.event;
    if (event.body && (!req.body || Object.keys(req.body).length === 0)) {
      try {
        let bodyStr = event.body;
        if (event.isBase64Encoded) {
          bodyStr = Buffer.from(bodyStr, "base64").toString("utf8");
        }
        req.body = JSON.parse(bodyStr);
        console.log("[SERVERLESS] Parsed body:", req.body);
      } catch (err) {
        console.warn("[SERVERLESS] Body parse error:", err.message);
      }
    }
  }
  next();
});

// ── Clerk Authentication ──────────────────────────────
if (process.env.CLERK_SECRET_KEY) {
  try {
    app.use(clerkMiddleware());
    console.log("🔒 Clerk authentication middleware enabled");
  } catch (err) {
    console.error("Failed to initialize Clerk middleware:", err.message);
  }
} else {
  console.warn("⚠️ Warning: CLERK_SECRET_KEY is not defined. Backend running in INSECURE mode.");
}

// ── Request logger (dev only) ─────────────────────────
if (isDev) {
  app.use((req, _res, next) => {
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`[${ts}] ${req.method} ${req.url}`);
    next();
  });
}

// ── Health check ──────────────────────────────────────
app.get(["/api/health", "/health"], (_req, res) => {
  res.json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ── Root greeting ─────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    message: "InterviewAI API is running successfully!",
    health: "/api/health",
  });
});

// ── Routes ────────────────────────────────────────────
app.use("/api", interviewRoutes);
app.use(interviewRoutes);

app.use("/api", subscriptionRoutes);
app.use(subscriptionRoutes);

app.use("/api/dashboard", dashboardRoutes);
app.use("/dashboard", dashboardRoutes);

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

if (!process.env.NETLIFY) {
  app.listen(PORT, () => {
    console.log(`\n🚀 InterviewAI backend running on http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
  });
}

export default app;