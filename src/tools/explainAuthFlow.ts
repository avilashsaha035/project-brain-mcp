import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { scanRepo, readFileSafe } from "../utils/fileScanner.js";
import { askClaude } from "../utils/aiHelper.js";

// Keywords that suggest a file is auth-related
const AUTH_KEYWORDS = [
    "auth", "login", "logout", "signin", "signup", "register",
    "password", "token", "jwt", "oauth", "session", "cookie",
    "middleware", "guard", "permission", "role", "user", "credential",
    "passport", "bcrypt", "hash", "verify", "refresh", "bearer"
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
                "Finds all authentication and authorization related files in the repo, reads their actual code, and gives a detailed explanation of how auth works: login flow, token handling, session management, protected routes, and role/permission checks.",
            inputSchema: {
                repo_path: z
                    .string()
                    .describe("Absolute or relative path to the project folder"),
            },
        },
        async ({ repo_path }: { repo_path: string }) => {
            try {
                const repo = scanRepo(repo_path);

                // Filter to auth-related files only
                const authFiles = repo.files.filter((f) => isAuthRelated(f.relativePath));

                if (authFiles.length === 0) {
                    return {
                        content: [
                            {
                                type: "text" as const,
                                text: "No authentication-related files found in this project. The project may not have auth, or it may use an external auth service.",
                            },
                        ],
                    };
                }

                // Read up to 15 auth files (cap to avoid token overflow)
                const filesToRead = authFiles.slice(0, 15);
                const codeContext = filesToRead
                    .map((f) => {
                        const content = readFileSafe(f.absolutePath, 8_000);
                        return `=== ${f.relativePath} ===\n${content}`;
                    })
                    .join("\n\n");

                const systemPrompt = `You are Project Brain, a senior security engineer and software architect.
                    You explain authentication and authorization systems clearly.
                    Use markdown with headers. Include flow diagrams using ASCII or text if helpful.
                    Focus on practical understanding: how does a user actually log in and access protected resources?`;

                const userMessage = `Analyze the authentication and authorization system in this project.

                AUTH-RELATED FILES FOUND (${filesToRead.length} files):
                ${filesToRead.map((f) => `- ${f.relativePath}`).join("\n")}

                ACTUAL CODE:
                ${codeContext}

                Please explain:
                1. **Login Flow** — step by step what happens when a user logs in
                2. **Token/Session Strategy** — JWT, sessions, cookies, or other mechanism?
                3. **How tokens are stored and validated**
                4. **Protected Routes** — how does the system block unauthorized access?
                5. **Roles & Permissions** — is there role-based access control (RBAC)?
                6. **Logout & Token Refresh** — how are sessions ended or tokens refreshed?
                7. **Any security concerns or noteworthy patterns**`;

                const explanation = await askClaude(systemPrompt, userMessage);

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `## Authentication Flow Analysis\n\n**Files analyzed:** ${filesToRead.map((f) => `\`${f.relativePath}\``).join(", ")}\n\n${explanation}`,
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