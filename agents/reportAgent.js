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

export async function generateReport(role, level, techStack, history) {
    const historyText = history.map((h, i) =>
        `Q${i + 1}: ${h.question}\nA${i + 1}: ${h.answer}\nEvaluation: ${h.evaluation}\nScore: ${h.score}/10`
    ).join("\n\n");

    const prompt = `
You are an expert technical interview evaluator. Generate a comprehensive interview report.

Interview Context:
Role: ${role}
Experience Level: ${level}
Tech Stack: ${techStack}
Total Questions: ${history.length}

Interview Transcript:
${historyText}

Generate a detailed report in this exact JSON format (no markdown, no code blocks):
{
  "overallScore": 7.5,
  "verdict": "Recommended / Not Recommended / Needs Improvement",
  "summary": "2-3 sentence overall assessment",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "improvements": ["area 1", "area 2", "area 3"],
  "questionBreakdown": [
    {
      "question": "the question asked",
      "score": 8,
      "feedback": "brief specific feedback"
    }
  ],
  "recommendations": "1-2 sentences of advice for the candidate"
}
`;

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const text = await generateText(prompt, { json: true });
            return cleanAndParse(text);
        } catch (err) {
            if (attempt === 1) throw err;
            console.warn(`[REPORT] Parse failed on attempt ${attempt + 1}, retrying...`);
            await new Promise((r) => setTimeout(r, 500));
        }
    }
}
