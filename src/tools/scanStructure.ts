import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { scanRepo, readFileSafe } from "../utils/fileScanner.js";
import { askClaude } from "../utils/aiHelper.js";
import { isGitHubUrl, scanGitHubRepo } from "../utils/githubApi.js";
import path from "path";
import fs from "fs";

export function registerScanStructure(server: McpServer) {
    server.registerTool(
        "scan_repo_structure",
        {
            title: "Scan Repository Structure",
            description:
                "Scans a project and explains the tech stack and architecture. Accepts a local folder path OR a GitHub URL (e.g. https://github.com/user/repo) — no cloning needed.",
            inputSchema: {
                repo_path: z
                    .string()
                    .describe("Local folder path OR a GitHub repo URL (https://github.com/user/repo)"),
            },
        },
        async ({ repo_path }: { repo_path: string }) => {
            try {
                let treeText = "";
                let codeContext = "";
                let totalFiles = 0;

                if (isGitHubUrl(repo_path)) {
                    // ── GitHub path: fetch directly via API ──
                    const ghRepo = await scanGitHubRepo(repo_path, 20);
                    treeText = ghRepo.tree;
                    totalFiles = ghRepo.totalFiles;
                    codeContext = ghRepo.files
                        .map((f) => `--- ${f.path} ---\n${f.content}`)
                        .join("\n\n");
                } else {
                    // ── Local path ──
                    const repo = scanRepo(repo_path);
                    treeText = repo.tree;
                    totalFiles = repo.totalFiles;

                    const importantFiles = [
                        "package.json", "requirements.txt", "go.mod", "Cargo.toml",
                        "pyproject.toml", "Gemfile", "pom.xml", "build.gradle",
                        "README.md", "docker-compose.yml", "Dockerfile",
                    ];
                    const parts: string[] = [];
                    for (const fileName of importantFiles) {
                        const filePath = path.join(repo.rootPath, fileName);
                        if (fs.existsSync(filePath)) {
                            parts.push(`--- ${fileName} ---\n${readFileSafe(filePath, 10_000)}`);
                        }
                    }
                    codeContext = parts.join("\n\n");
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
                ${treeText}

                KEY FILES CONTENT:
                ${codeContext}

                Total source files found: ${totalFiles}`;

                const explanation = await askClaude(systemPrompt, userMessage);

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `## Project Structure\n\n\`\`\`\n${treeText}\`\`\`\n\n## AI Analysis\n\n${explanation}`,
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