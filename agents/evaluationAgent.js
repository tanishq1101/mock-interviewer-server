import { generateText } from "../services/geminiService.js";

function cleanAndParse(text) {
    const cleaned = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

    try {
        return JSON.parse(cleaned);
    } catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            return JSON.parse(match[0]);
        }
        throw new Error(`Failed to parse AI response as JSON: ${cleaned.slice(0, 200)}`);
    }
}

export async function evaluateAnswer(role, level, techStack, question, answer, history = []) {
    const historyText = history.map((h, i) =>
        `Q${i + 1}: ${h.question}\nA${i + 1}: ${h.answer}\nFeedback: ${h.evaluation}`
    ).join("\n\n");

    const prompt = `
You are a senior technical interviewer evaluating a candidate's response.

Interview Context:
Role: ${role}
Experience Level: ${level}
Tech Stack: ${techStack}

${historyText ? `Previous conversation:\n${historyText}\n` : ""}
Current Question: ${question}
Candidate's Answer: ${answer}

Instructions:
1. Evaluate the answer on accuracy, depth, and relevance (1-2 sentences).
2. Give a score from 1-10.
3. Ask one follow-up question that builds on the topic or explores a new relevant area.

Respond in this exact JSON format (no markdown, no code blocks):
{"evaluation": "your evaluation text", "score": 8, "nextQuestion": "your follow-up question"}
`;

    // Try up to 2 times for JSON parsing
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const text = await generateText(prompt, { json: true });
            return cleanAndParse(text);
        } catch (err) {
            if (attempt === 1) throw err;
            console.warn(`[EVAL] Parse failed on attempt ${attempt + 1}, retrying...`);
            await new Promise((r) => setTimeout(r, 500));
        }
    }
}
