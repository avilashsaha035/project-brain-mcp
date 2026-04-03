import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { scanRepo, readFileSafe } from "../utils/fileScanner.js";
import { askClaude } from "../utils/aiHelper.js";

// Score a file's relevance to a question based on keyword matching
function scoreFileRelevance(filePath: string, question: string): number {
    const lowerPath = filePath.toLowerCase();
    const words = question.toLowerCase().split(/\s+/);
    let score = 0;

    for (const word of words) {
        if (word.length > 3 && lowerPath.includes(word)) {
            score += 2;
        }
    }

    // Boost important file types
    if (lowerPath.includes("index")) score += 1;
    if (lowerPath.includes("main")) score += 1;
    if (lowerPath.includes("app")) score += 1;
    if (lowerPath.includes("router") || lowerPath.includes("route")) score += 1;
    if (lowerPath.includes("controller")) score += 1;
    if (lowerPath.includes("service")) score += 1;
    if (lowerPath.includes("model")) score += 1;

    return score;
}

export function registerAskCodebase(server: McpServer) {
    server.registerTool(
        "ask_codebase",
        {
            title: "Ask About Codebase",
            description:
                "Ask any question about a codebase and get an answer grounded in the actual code. For example: 'How does the payment processing work?', 'Where is the database schema defined?', 'How are API routes organized?', 'What happens when a user submits a form?'",
            inputSchema: {
                repo_path: z
                    .string()
                    .describe("Absolute or relative path to the project folder"),
                question: z
                    .string()
                    .describe(
                        "Your question about the codebase — be as specific or general as you like"
                    ),
                max_files: z
                    .number()
                    .optional()
                    .default(12)
                    .describe("Max number of files to read for context (default: 12)"),
            },
        },
        async ({ repo_path, question, max_files = 12 }: { repo_path: string; question: string; max_files?: number }) => {
            try {
                const repo = scanRepo(repo_path);

                // Score and rank all files by relevance to the question
                const scored = repo.files
                    .map((f) => ({
                        ...f,
                        score: scoreFileRelevance(f.relativePath, question),
                    }))
                    .sort((a, b) => b.score - a.score);

                // Take top N most relevant files
                const topFiles = scored.slice(0, max_files);

                // Build code context
                const codeContext = topFiles
                    .map((f) => {
                        const content = readFileSafe(f.absolutePath, 8_000);
                        return `=== ${f.relativePath} ===\n${content}`;
                    })
                    .join("\n\n");

                // Also provide the file tree so Claude has the full picture
                const fileList = repo.files
                    .map((f) => f.relativePath)
                    .join("\n");

                const systemPrompt = `You are Project Brain, an expert software engineer who deeply understands codebases.
                You answer questions about code clearly and accurately, always grounding your answer in the actual code provided.
                When referencing specific code, quote the relevant lines.
                If the answer requires looking at files not in the provided context, say so explicitly.
                Use markdown formatting.`;

                const userMessage = `Project: ${repo_path}
                Question: ${question}

                I've selected the ${topFiles.length} most relevant files for your question.

                FILES READ:
                ${topFiles.map((f) => `- ${f.relativePath} (relevance score: ${f.score})`).join("\n")}

                ALL FILES IN PROJECT (for reference):
                ${fileList}

                CODE CONTEXT:
                ${codeContext}

                Please answer the question: "${question}"

                Ground your answer in the actual code above. Quote specific files and line patterns when helpful.`;

                const answer = await askClaude(systemPrompt, userMessage);

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `## Q: ${question}\n\n${answer}\n\n---\n*Files analyzed: ${topFiles.map((f) => `\`${f.relativePath}\``).join(", ")}*`,
                        },
                    ],
                };
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                return {
                    content: [{ type: "text" as const, text: `Error: ${msg}` }],
                    isError: true,
                };
            }
        }
    );
}