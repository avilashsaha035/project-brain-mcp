import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { scanRepo } from "../utils/fileScanner.js";
import { askClaude } from "../utils/aiHelper.js";
import { isGitHubUrl, scanGitHubRepo } from "../utils/githubApi.js";

export function registerIdentifyKeyFiles(server: McpServer) {
    server.registerTool(
        "identify_key_files",
        {
            title: "Identify Key Files",
            description:
                "Identifies the most important files a developer must read first. Accepts a local folder path OR a GitHub URL (e.g. https://github.com/user/repo) — no cloning needed.",
            inputSchema: {
                repo_path: z
                    .string()
                    .describe("Local folder path OR a GitHub repo URL (https://github.com/user/repo)"),
                focus: z
                    .string()
                    .optional()
                    .describe("Optional focus area e.g. 'backend API', 'database models'"),
            },
        },
        async ({ repo_path, focus }: { repo_path: string; focus?: string }) => {
            try {
                let fileList = "";

                if (isGitHubUrl(repo_path)) {
                    const ghRepo = await scanGitHubRepo(repo_path, 20);
                    fileList = ghRepo.files
                        .map((f) => `${f.path} (${Math.round(f.size / 1024)}KB)`)
                        .join("\n");
                } else {
                    const repo = scanRepo(repo_path);
                    fileList = repo.files
                        .map((f) => `${f.relativePath} (${Math.round(f.sizeBytes / 1024)}KB)`)
                        .join("\n");
                }

                const systemPrompt = `You are Project Brain, an expert software architect.
                Help new developers understand codebases quickly.
                Format as a numbered list with file path, role, and 1-2 sentence explanation.`;

                const focusClause = focus
                    ? `The developer wants to focus on: "${focus}". Prioritize relevant files.`
                    : "Cover all major areas: entry points, routing, models, config, and core logic.";

                const userMessage = `Here is a complete list of source files in this project:

                ${fileList}

                ${focusClause}

                Identify the TOP 10-15 most important files a new developer should read first.
                For each file provide:
                - The file path
                - Its role (1 sentence)
                - Why it's important (1 sentence)

                Then suggest a reading order.`;

                const analysis = await askClaude(systemPrompt, userMessage);

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `## Key Files in \`${repo_path}\`\n\n${analysis}`,
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