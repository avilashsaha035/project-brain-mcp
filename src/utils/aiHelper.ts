import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Single reusable function to ask Claude about code
export async function askClaude(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
    });

    const block = response.content[0];
    if (block.type !== "text") return "No response generated.";
    return block.text;
}