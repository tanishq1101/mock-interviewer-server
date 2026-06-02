import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GROQ_API_KEY;
let groq = null;

if (!apiKey) {
    console.warn("⚠️ Warning: GROQ_API_KEY is not set. Text generation features will fail.");
} else {
    console.log(`✓ Groq API key loaded (${apiKey.slice(0, 8)}...${apiKey.slice(-4)})`);
    groq = new Groq({ apiKey });
}

/**
 * Generate a completion using Groq.
 * Uses llama-3.3-70b-versatile — fast, high quality, free tier.
 */
export async function generateText(prompt, { json = false, maxRetries = 2 } = {}) {
    if (!groq) {
        throw new Error("GROQ_API_KEY is not set on the server.");
    }
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const completion = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.4,
                max_tokens: 1200,
                ...(json && { response_format: { type: "json_object" } }),
            });

            return completion.choices[0]?.message?.content?.trim() || "";
        } catch (err) {
            const is429 = err.status === 429 || err.message?.includes("429");

            if (is429 && attempt < maxRetries) {
                const waitSec = 5 * (attempt + 1);
                console.log(`⏳ Rate limited. Waiting ${waitSec}s before retry ${attempt + 1}/${maxRetries}...`);
                await new Promise((r) => setTimeout(r, waitSec * 1000));
                continue;
            }

            throw err;
        }
    }
}