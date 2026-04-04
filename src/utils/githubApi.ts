import https from "https";

// Parse GitHub URL into owner and repo name
export function parseGitHubUrl(url: string): { owner: string; repo: string } {
    const cleaned = url
        .replace(/^https?:\/\/github\.com\//, "")
        .replace(/^git@github\.com:/, "")
        .replace(/\.git$/, "")
        .replace(/\/$/, "");

    const parts = cleaned.split("/");
    if (parts.length < 2) {
        throw new Error(`Invalid GitHub URL: ${url}`);
    }

    return { owner: parts[0], repo: parts[1] };
}

export function isGitHubUrl(input: string): boolean {
    return (
        input.startsWith("https://github.com/") ||
        input.startsWith("http://github.com/") ||
        input.startsWith("git@github.com:")
    );
}

// Simple HTTPS GET helper (no external dependencies)
function httpsGet(url: string, token?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                "User-Agent": "project-brain-mcp/1.0",
                "Accept": "application/vnd.github.v3+json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        };

        https.get(url, options, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                if (res.statusCode === 403) {
                    reject(new Error("GitHub API rate limit hit. Set GITHUB_TOKEN in your env to get higher limits."));
                } else if (res.statusCode === 404) {
                    reject(new Error("Repo not found or is private. For private repos set GITHUB_TOKEN."));
                } else if (res.statusCode !== 200) {
                    reject(new Error(`GitHub API error: ${res.statusCode} — ${data}`));
                } else {
                    resolve(data);
                }
            });
            res.on("error", reject);
        }).on("error", reject);
    });
}

export interface GitHubFile {
    path: string;
    content: string;
    size: number;
    type: "file" | "dir";
}

export interface GitHubRepo {
    owner: string;
    repo: string;
    tree: string;
    files: GitHubFile[];
    totalFiles: number;
}

// File extensions we care about (same as fileScanner.ts)
const SUPPORTED_EXTENSIONS = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java",
    ".cs", ".cpp", ".c", ".h", ".rb", ".php", ".swift", ".kt",
    ".json", ".yaml", ".yml", ".toml", ".md", ".mdx", ".txt",
    ".sql", ".prisma", ".graphql", ".html", ".css", ".scss",
    ".vue", ".svelte", ".env.example", ".sh",
]);

const SKIP_DIRS = new Set([
    "node_modules", ".git", ".next", ".nuxt", "dist", "build",
    "coverage", ".cache", "__pycache__", ".venv", "venv",
    ".idea", ".vscode", "vendor", "target", "bin", "obj",
]);

function shouldInclude(path: string): boolean {
    const parts = path.split("/");
    // Skip if any segment is a blocked directory
    for (const part of parts) {
        if (SKIP_DIRS.has(part)) return false;
    }
    const lastPart = parts[parts.length - 1];
    const ext = lastPart.includes(".")
        ? "." + lastPart.split(".").slice(1).join(".")
        : lastPart;
    return SUPPORTED_EXTENSIONS.has(ext) || SUPPORTED_EXTENSIONS.has("." + ext);
}

// Fetch full repo tree using GitHub Trees API (single API call)
async function fetchRepoTree(owner: string, repo: string, token?: string): Promise<any[]> {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;
    const raw = await httpsGet(url, token);
    const data = JSON.parse(raw);

    if (data.truncated) {
        console.error("Warning: repo tree was truncated by GitHub (very large repo)");
    }

    return data.tree || [];
}

// Fetch a single file's content from GitHub
async function fetchFileContent(owner: string, repo: string, path: string, token?: string): Promise<string> {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
    const raw = await httpsGet(url, token);
    const data = JSON.parse(raw);

    if (data.encoding === "base64" && data.content) {
        return Buffer.from(data.content, "base64").toString("utf-8");
    }

    return "[Could not decode file content]";
}

// Build ASCII tree from flat file list
function buildAsciiTree(files: { path: string }[], repoName: string): string {
    const tree: Record<string, any> = {};

    for (const f of files) {
        const parts = f.path.split("/");
        let node = tree;
        for (const part of parts) {
            if (!node[part]) node[part] = {};
            node = node[part];
        }
    }

    function renderTree(node: Record<string, any>, prefix = ""): string {
        let result = "";
        const keys = Object.keys(node).sort((a, b) => {
            const aIsDir = Object.keys(node[a]).length > 0;
            const bIsDir = Object.keys(node[b]).length > 0;
            if (aIsDir && !bIsDir) return -1;
            if (!aIsDir && bIsDir) return 1;
            return a.localeCompare(b);
        });

        keys.forEach((key, index) => {
            const isLast = index === keys.length - 1;
            const connector = isLast ? "└── " : "├── ";
            const childPrefix = isLast ? "    " : "│   ";
            result += `${prefix}${connector}${key}\n`;
            if (Object.keys(node[key]).length > 0) {
                result += renderTree(node[key], prefix + childPrefix);
            }
        });

        return result;
    }

    return `${repoName}/\n` + renderTree(tree);
}

// Main function: scan a GitHub repo directly via API
export async function scanGitHubRepo(githubUrl: string, maxFiles = 20): Promise<GitHubRepo> {
    const { owner, repo } = parseGitHubUrl(githubUrl);
    const token = process.env.GITHUB_TOKEN;

    // Fetch full repo tree in one API call
    const treeItems = await fetchRepoTree(owner, repo, token);

    // Filter to only supported files
    const relevantItems = treeItems.filter(
        (item: any) => item.type === "blob" && shouldInclude(item.path)
    );

    // Build ASCII tree from ALL relevant files (for display)
    const treeDisplay = buildAsciiTree(relevantItems, repo);

    // Prioritize important files to read content from
    const priorityFiles = [
        "package.json", "requirements.txt", "go.mod", "Cargo.toml",
        "README.md", "docker-compose.yml", "Dockerfile", "pyproject.toml",
    ];

    const sorted = [...relevantItems].sort((a: any, b: any) => {
        const aName = a.path.split("/").pop() || "";
        const bName = b.path.split("/").pop() || "";
        const aPriority = priorityFiles.includes(aName) ? 0 : 1;
        const bPriority = priorityFiles.includes(bName) ? 0 : 1;
        return aPriority - bPriority;
    });

    // Fetch content for top N files (parallel requests)
    const filesToFetch = sorted.slice(0, maxFiles);

    const fileContents = await Promise.all(
        filesToFetch.map(async (item: any) => {
            // Skip very large files
            if (item.size > 80_000) {
                return {
                    path: item.path,
                    content: `[File too large: ${Math.round(item.size / 1024)}KB — skipped]`,
                    size: item.size,
                    type: "file" as const,
                };
            }

            try {
                const content = await fetchFileContent(owner, repo, item.path, token);
                return {
                    path: item.path,
                    content,
                    size: item.size,
                    type: "file" as const,
                };
            } catch {
                return {
                    path: item.path,
                    content: "[Could not fetch file]",
                    size: item.size,
                    type: "file" as const,
                };
            }
        })
    );

    return {
        owner,
        repo,
        tree: treeDisplay,
        files: fileContents,
        totalFiles: relevantItems.length,
    };
}