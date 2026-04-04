import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { scanRepo, readFileSafe } from "../utils/fileScanner.js";
import { askAgent } from "../utils/aiHelper.js";
import { isGitHubUrl, scanGitHubRepo } from "../utils/githubApi.js";

function scoreRelevance(filePath: string, question: string): number {
    const lowerPath = filePath.toLowerCase();
    const words = question.toLowerCase().split(/\s+/);
    let score = 0;
    for (const word of words) {
        if (word.length > 3 && lowerPath.includes(word)) score += 2;
    }
    if (lowerPath.includes("index")) score += 1;
    if (lowerPath.includes("main")) score += 1;
    if (lowerPath.includes("app")) score += 1;
    if (lowerPath.includes("route")) score += 1;
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
                "Ask any question about a codebase and get an answer grounded in the actual code. Accepts a local folder path OR a GitHub URL (e.g. https://github.com/user/repo) — no cloning needed.",
            inputSchema: {
                repo_path: z
                    .string()
                    .describe("Local folder path OR a GitHub repo URL (https://github.com/user/repo)"),
                question: z
                    .string()
                    .describe("Your question about the codebase"),
                max_files: z
                    .number()
                    .optional()
                    .default(12)
                    .describe("Max number of files to read for context (default: 12)"),
            },
        },
        async ({ repo_path, question, max_files = 12 }: { repo_path: string; question: string; max_files?: number }) => {
            try {
                let allFilePaths: string[] = [];
                let codeContext = "";

                if (isGitHubUrl(repo_path)) {
                    // Fetch more files so we can score and pick the most relevant
                    const ghRepo = await scanGitHubRepo(repo_path, 40);

                    // Score by relevance to question
                    const scored = ghRepo.files
                        .map((f) => ({ ...f, score: scoreRelevance(f.path, question) }))
                        .sort((a, b) => b.score - a.score);

                    const topFiles = scored.slice(0, max_files);
                    allFilePaths = ghRepo.files.map((f) => f.path);
                    codeContext = topFiles
                        .map((f) => `=== ${f.path} ===\n${f.content}`)
                        .join("\n\n");
                } else {
                    const repo = scanRepo(repo_path);
                    const scored = repo.files
                        .map((f) => ({ ...f, score: scoreRelevance(f.relativePath, question) }))
                        .sort((a, b) => b.score - a.score);

                    const topFiles = scored.slice(0, max_files);
                    allFilePaths = repo.files.map((f) => f.relativePath);
                    codeContext = topFiles
                        .map((f) => `=== ${f.relativePath} ===\n${readFileSafe(f.absolutePath, 8_000)}`)
                        .join("\n\n");
                }

                const systemPrompt = `You are Project Brain, an expert software engineer.
                Answer questions about code accurately, grounding answers in the actual code provided.
                Quote relevant lines when helpful. Use markdown formatting.`;

                const userMessage = `Project: ${repo_path}
                Question: ${question}

                ALL FILES:
                ${allFilePaths.join("\n")}

                CODE CONTEXT (most relevant files):
                ${codeContext}

                Answer: "${question}"`;

                const answer = await askAgent(systemPrompt, userMessage);

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `## Q: ${question}\n\n${answer}`,
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