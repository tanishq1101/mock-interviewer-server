import { generateText } from "../services/geminiService.js";

export async function startInterview(role, level, techStack, interviewType = "technical") {
    const typeInstructions = {
        technical: "Focus on technical questions: data structures, algorithms, system design, coding problems, and technology-specific concepts.",
        behavioral: "Focus on behavioral questions: leadership, teamwork, conflict resolution, communication, and situational scenarios. Use the STAR method framework.",
        mixed: "Alternate between technical and behavioral questions. Start with a technical question.",
    };

    const typeGuidance = typeInstructions[interviewType] || typeInstructions.technical;

    const prompt = `
You are a senior technical interviewer.

Rules:
- Ask one question only.
- Adapt difficulty based on experience.
- Be professional and slightly challenging.

Interview Context:
Role: ${role}
Experience Level: ${level}
Tech Stack: ${techStack}
Interview Type: ${interviewType}

${typeGuidance}

Start interview with greeting and first question.
`;

    return await generateText(prompt);
}