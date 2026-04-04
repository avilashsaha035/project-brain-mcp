import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { scanRepo, readFileSafe } from "../utils/fileScanner.js";
import { askAgent } from "../utils/aiHelper.js";
import { isGitHubUrl, scanGitHubRepo } from "../utils/githubApi.js";

const AUTH_KEYWORDS = [
    "auth", "login", "logout", "signin", "signup", "register",
    "password", "token", "jwt", "oauth", "session", "cookie",
    "middleware", "guard", "permission", "role", "user", "credential",
    "passport", "bcrypt", "hash", "verify", "refresh", "bearer",
];

function isAuthRelated(filePath: string): boolean {
    const lower = filePath.toLowerCase();
    return AUTH_KEYWORDS.some((kw) => lower.includes(kw));
}

export function registerExplainAuthFlow(server: McpServer) {
    server.registerTool(
        "explain_auth_flow",
        {
            title: "Explain Authentication Flow",
            description:
                "Finds all auth-related files and explains login flow, tokens, sessions, and permissions. Accepts a local folder path OR a GitHub URL (e.g. https://github.com/user/repo) — no cloning needed.",
            inputSchema: {
                repo_path: z
                    .string()
                    .describe("Local folder path OR a GitHub repo URL (https://github.com/user/repo)"),
            },
        },
        async ({ repo_path }: { repo_path: string }) => {
            try {
                let authFilePaths: string[] = [];
                let codeContext = "";

                if (isGitHubUrl(repo_path)) {
                    // Fetch all files, then filter auth-related ones
                    const ghRepo = await scanGitHubRepo(repo_path, 40);
                    const authFiles = ghRepo.files.filter((f) => isAuthRelated(f.path));

                    if (authFiles.length === 0) {
                        return {
                            content: [{
                                type: "text" as const,
                                text: "No authentication-related files found in this repo.",
                            }],
                        };
                    }

                    authFilePaths = authFiles.map((f) => f.path);
                    codeContext = authFiles
                        .slice(0, 15)
                        .map((f) => `=== ${f.path} ===\n${f.content}`)
                        .join("\n\n");
                } else {
                    const repo = scanRepo(repo_path);
                    const authFiles = repo.files.filter((f) => isAuthRelated(f.relativePath));

                    if (authFiles.length === 0) {
                        return {
                            content: [{
                                type: "text" as const,
                                text: "No authentication-related files found in this project.",
                            }],
                        };
                    }

                    authFilePaths = authFiles.map((f) => f.relativePath);
                    codeContext = authFiles
                        .slice(0, 15)
                        .map((f) => `=== ${f.relativePath} ===\n${readFileSafe(f.absolutePath, 8_000)}`)
                        .join("\n\n");
                }

                const systemPrompt = `You are Project Brain, a senior security engineer and software architect.
                Explain authentication systems clearly using markdown with headers.
                Focus on practical understanding: how does a user actually log in and access protected resources?`;

                const userMessage = `Analyze the authentication system in this project.

                AUTH FILES FOUND:
                ${authFilePaths.map((p) => `- ${p}`).join("\n")}

                CODE:
                ${codeContext}

                Explain:
                1. **Login Flow** — step by step what happens when a user logs in
                2. **Token/Session Strategy** — JWT, sessions, cookies, or other?
                3. **How tokens are stored and validated**
                4. **Protected Routes** — how does the system block unauthorized access?
                5. **Roles & Permissions** — is there RBAC?
                6. **Logout & Token Refresh**
                7. **Any security concerns or noteworthy patterns**`;

                const explanation = await askAgent(systemPrompt, userMessage);

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `## Authentication Flow Analysis\n\n**Files analyzed:** ${authFilePaths.map((p) => `\`${p}\``).join(", ")}\n\n${explanation}`,
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