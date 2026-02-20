
import { generateText } from './llm-provider';

export async function classifyContent(content: string, existingTags: string[]): Promise<{ tags: string[], newTags: string[], reasoning: string }> {
    const systemInstruction = `You are an expert content curator. Your task is to analyze content and assign relevant TOPICS (tags).
    Context: EXISTING TOPICS: ${JSON.stringify(existingTags)}`;

    const prompt = `
    Analyze the following content deeply.
    1. Assign RELEVANT tags from the existing list.
    2. Proactively CREATE NEW TOPICS if needed (concise, standard).
    3. Return valid JSON only.

    Content Snippet:
    ${content.substring(0, 5000)}

    Output Format:
    {
        "tags": ["tag1", "new_tag2"],
        "newTags": ["new_tag2"],
        "reasoning": "Explanation..."
    }
    `;

    try {
        const text = await generateText(prompt, systemInstruction);
        
        // Clean up markdown
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(jsonStr);
        
        return {
            tags: data.tags || [],
            newTags: data.newTags || [],
            reasoning: data.reasoning || ""
        };
    } catch (error) {
        console.error("Classification failed:", error);
        throw error;
    }
}
