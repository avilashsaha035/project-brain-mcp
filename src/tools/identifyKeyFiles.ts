import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { scanRepo, readFileSafe } from "../utils/fileScanner.js";
import { askClaude } from "../utils/aiHelper.js";

export function registerIdentifyKeyFiles(server: McpServer) {
    server.registerTool(
        "identify_key_files",
        {
            title: "Identify Key Files",
            description:
                "Scans the repo and identifies the most important files a developer must understand — entry points, config files, core modules, and business logic files. Returns each file with a brief explanation of its role.",
            inputSchema: {
                repo_path: z
                    .string()
                    .describe("Absolute or relative path to the project folder"),
                focus: z
                    .string()
                    .optional()
                    .describe(
                        "Optional: Focus area e.g. 'backend API', 'database models', 'frontend components'"
                    ),
            },
        },
        async ({ repo_path, focus }: { repo_path: string; focus?: string }) => {
            try {
                const repo = scanRepo(repo_path);

                // Provide file list with sizes to Claude so it can reason about importance
                const fileList = repo.files
                    .map((f) => `${f.relativePath} (${Math.round(f.sizeBytes / 1024)}KB)`)
                    .join("\n");

                const systemPrompt = `You are Project Brain, an expert software architect.
                Your job is to help new developers understand codebases quickly.
                When identifying key files, focus on what someone MUST read to understand the project.
                Format your response as a numbered list with file path, role, and 1-2 sentence explanation.`;

                const focusClause = focus
                    ? `The developer wants to focus on: "${focus}". Prioritize files relevant to that area.`
                    : "Cover all major areas: entry points, routing, models, config, and core logic.";

                const userMessage = `Here is a complete list of source files in this project:

                ${fileList}

                ${focusClause}

                Identify the TOP 10-15 most important files a new developer should read first.
                For each file, provide:
                - The file path
                - Its role (1 sentence)
                - Why it's important to read (1 sentence)

                Then suggest a reading order: which files to read first, second, etc.`;

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