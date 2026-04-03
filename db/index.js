import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
import * as schema from "./schema.js";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    console.warn("⚠️  DATABASE_URL not set — database features disabled");
    console.warn("   Get a free DB at: https://neon.tech");
}

let db = null;

if (databaseUrl) {
    try {
        const sql = neon(databaseUrl);
        db = drizzle(sql, { schema });
        console.log("✓ Database connected (Neon PostgreSQL)");
    } catch (err) {
        console.error("❌ Database connection failed:", err.message);
    }
}

export { db };
export { schema };
