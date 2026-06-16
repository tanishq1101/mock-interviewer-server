import { generateText } from "../services/groqService.js";

export const PERSONAS = [
    { name: "David", role: "Technical Lead", avatar: "david", badge: "Tech Lead", description: "Deeply technical, focused on optimization, design patterns, and efficiency." },
    { name: "Elena", role: "Product Manager", avatar: "elena", badge: "PM", description: "Focused on user experience, product sense, collaboration, and delivery." },
    { name: "Sarah", role: "Hiring Manager", avatar: "sarah", badge: "HM", description: "Focused on cultural fit, behavioral alignment, soft skills, and leadership." }
];

export function getInterviewerForStep(stepIndex, interviewType) {
    if (interviewType === "technical") {
        const techPersonas = [PERSONAS[0], PERSONAS[0], PERSONAS[1], PERSONAS[0], PERSONAS[2]];
        return techPersonas[stepIndex % techPersonas.length];
    } else if (interviewType === "behavioral") {
        const behavioralPersonas = [PERSONAS[2], PERSONAS[1], PERSONAS[2], PERSONAS[1]];
        return behavioralPersonas[stepIndex % behavioralPersonas.length];
    } else {
        return PERSONAS[stepIndex % PERSONAS.length];
    }
}

export async function startInterview(role, level, techStack, interviewType = "technical", resumeText = "") {
    const interviewer = getInterviewerForStep(0, interviewType);
    
    const typeInstructions = {
        technical: "Focus on technical questions: data structures, algorithms, system design, coding problems, and technology-specific concepts.",
        behavioral: "Focus on behavioral questions: leadership, teamwork, conflict resolution, communication, and situational scenarios. Use the STAR method framework.",
        mixed: "Alternate between technical and behavioral questions. Start with a technical question.",
    };

    const typeGuidance = typeInstructions[interviewType] || typeInstructions.technical;
    
    let resumeGuidance = "";
    if (resumeText && resumeText.trim()) {
        resumeGuidance = `
Candidate's Resume Context:
${resumeText.trim()}
Please tailor your questions to the candidate's actual projects, experiences, and background mentioned in their resume where appropriate. Avoid asking generic questions if they have relevant experience on their resume.
`;
    }

    const prompt = `
You are a senior technical interviewer. Today you are speaking as ${interviewer.name}, the ${interviewer.role} (${interviewer.description}).

Rules:
- Ask one question only.
- Adapt difficulty based on experience.
- Be professional and slightly challenging.
- Keep your tone and style aligned with your persona: ${interviewer.name}, the ${interviewer.role}.

Interview Context:
Role: ${role}
Experience Level: ${level}
Tech Stack: ${techStack}
Interview Type: ${interviewType}

${resumeGuidance}

${typeGuidance}

Start the interview with a brief greeting (stating your name and role) and ask the first question.
`;

    return await generateText(prompt);
}