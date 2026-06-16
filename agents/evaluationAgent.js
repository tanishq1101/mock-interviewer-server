import { generateText } from "../services/groqService.js";
import { getInterviewerForStep } from "./interviewAgent.js";

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

export async function evaluateAnswer(role, level, techStack, question, answer, history = [], code = "", codeLanguage = "", interviewType = "technical") {
    const historyText = history.map((h, i) =>
        `Q${i + 1}: ${h.question}\nA${i + 1}: ${h.answer}\nFeedback: ${h.evaluation}`
    ).join("\n\n");

    const nextInterviewer = getInterviewerForStep(history.length + 1, interviewType);

    let codeGuidance = "";
    if (code && code.trim()) {
        codeGuidance = `
Candidate's Code Submission (${codeLanguage || "javascript"}):
\`\`\`${codeLanguage || "javascript"}
${code.trim()}
\`\`\`
Analyze this code for syntax, logic, code quality, and estimate its Big O time & space complexity. Include your analysis in the evaluation feedback.
`;
    }

    // STAR behavioral evaluation guidance
    let starGuidance = "";
    if (interviewType === "behavioral" || interviewType === "mixed") {
        starGuidance = `
Evaluate using the STAR (Situation, Task, Action, Result) framework where appropriate. Grade the answer on how well they covered these elements.
`;
    }

    const prompt = `
You are a senior technical interviewer. Today you are speaking as ${nextInterviewer.name}, the ${nextInterviewer.role} (${nextInterviewer.description}).

Interview Context:
Role: ${role}
Experience Level: ${level}
Tech Stack: ${techStack}
Interview Type: ${interviewType}

${historyText ? `Previous conversation:\n${historyText}\n` : ""}
Current Question: ${question}
Candidate's Answer: ${answer}
${codeGuidance}
${starGuidance}

Instructions:
1. Evaluate the answer (and code if provided) on accuracy, depth, relevance, and Big-O efficiency if code is present. Keep your feedback concise (2-4 sentences).
2. Give a score from 1-10.
3. Ask the next question as ${nextInterviewer.name}, the ${nextInterviewer.role}. Align the question style to your role (e.g. system design/deep tech for Tech Lead, product sense for PM, culture/conflict for HM).

Respond in this exact JSON format (no markdown, no code blocks):
{"evaluation": "your evaluation text", "score": 8, "nextQuestion": "your follow-up question"}
`;

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

