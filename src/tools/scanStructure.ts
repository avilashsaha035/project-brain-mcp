import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { scanRepo, readFileSafe } from "../utils/fileScanner.js";
import { askClaude } from "../utils/aiHelper.js";
import path from "path";
import fs from "fs";

export function registerScanStructure(server: McpServer) {
    server.registerTool(
        "scan_repo_structure",
        {
            title: "Scan Repository Structure",
            description:
                "Scans a local project folder and returns the full file tree plus an AI explanation of what kind of project this is, its tech stack, and how it's organized.",
            inputSchema: {
                repo_path: z
                    .string()
                    .describe("Absolute or relative path to the project folder"),
            },
        },
        async ({ repo_path }: { repo_path: string }) => {
            try {
                const repo = scanRepo(repo_path);

                // Read a few key config files to give Claude more context
                const contextFiles: string[] = [];
                const importantFiles = [
                    "package.json", "requirements.txt", "go.mod", "Cargo.toml",
                    "pyproject.toml", "Gemfile", "pom.xml", "build.gradle",
                    "README.md", "docker-compose.yml", "Dockerfile",
                ];

                for (const fileName of importantFiles) {
                    const filePath = path.join(repo.rootPath, fileName);
                    if (fs.existsSync(filePath)) {
                        const content = readFileSafe(filePath, 10_000);
                        contextFiles.push(`--- ${fileName} ---\n${content}`);
                    }
                }

                const systemPrompt = `You are Project Brain, an expert software architect.
                You analyze codebases and explain them clearly to developers who are new to the project.
                Be concise but thorough. Use markdown formatting with headers and bullet points.`;

                const userMessage = `Analyze this project and explain:
                1. What kind of project is this? (web app, API, CLI tool, library, etc.)
                2. Tech stack and main dependencies
                3. How the project is organized (folder structure meaning)
                4. Entry points (where does the code start running?)
                5. Any notable patterns used (MVC, microservices, monorepo, etc.)

                FILE TREE:
                ${repo.tree}

                KEY CONFIG FILES:
                ${contextFiles.join("\n\n")}

                Total source files found: ${repo.totalFiles}`;

                const explanation = await askClaude(systemPrompt, userMessage);

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `## Project Structure\n\n\`\`\`\n${repo.tree}\`\`\`\n\n## AI Analysis\n\n${explanation}`,
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