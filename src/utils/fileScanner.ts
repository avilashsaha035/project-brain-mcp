import fs from "fs";
import path from "path";

// File extensions we care about (skip binaries, images, etc.)
const SUPPORTED_EXTENSIONS = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java",
    ".cs", ".cpp", ".c", ".h", ".rb", ".php", ".swift", ".kt",
    ".json", ".yaml", ".yml", ".toml", ".env.example",
    ".md", ".mdx", ".txt", ".sql", ".prisma", ".graphql",
    ".html", ".css", ".scss", ".vue", ".svelte",
    "Dockerfile", ".dockerignore", ".gitignore"
]);

// Directories to always skip
const SKIP_DIRS = new Set([
    "node_modules", ".git", ".next", ".nuxt", "dist", "build",
    "coverage", ".cache", "__pycache__", ".venv", "venv",
    ".idea", ".vscode", "vendor", "target", "bin", "obj"
]);

export interface FileEntry {
    relativePath: string;
    absolutePath: string;
    extension: string;
    sizeBytes: number;
}

export interface RepoStructure {
    rootPath: string;
    totalFiles: number;
    tree: string;
    files: FileEntry[];
}

// Build a visual ASCII tree of the project
function buildTree(dirPath: string, prefix = "", rootPath = dirPath): string {
    let result = "";
    let entries: fs.Dirent[];

    try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
        return "";
    }

    // Sort: directories first, then files
    entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
    });

    const visible = entries.filter((e) => {
        if (e.name.startsWith(".") && e.name !== ".env.example") return false;
        if (e.isDirectory() && SKIP_DIRS.has(e.name)) return false;
        return true;
    });

    visible.forEach((entry, index) => {
        const isLast = index === visible.length - 1;
        const connector = isLast ? "└── " : "├── ";
        const childPrefix = isLast ? "    " : "│   ";

        result += `${prefix}${connector}${entry.name}\n`;

        if (entry.isDirectory()) {
            const childPath = path.join(dirPath, entry.name);
            result += buildTree(childPath, prefix + childPrefix, rootPath);
        }
    });

    return result;
}

// Recursively collect all relevant files
function collectFiles(dirPath: string, rootPath = dirPath): FileEntry[] {
    const results: FileEntry[] = [];
    let entries: fs.Dirent[];

    try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
        return results;
    }

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
                results.push(...collectFiles(fullPath, rootPath));
            }
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name) || entry.name;
            if (SUPPORTED_EXTENSIONS.has(ext)) {
                const stat = fs.statSync(fullPath);
                results.push({
                    relativePath: path.relative(rootPath, fullPath),
                    absolutePath: fullPath,
                    extension: ext,
                    sizeBytes: stat.size,
                });
            }
        }
    }

    return results;
}

// Read a file safely (skip files > 100KB to avoid token overflow)
export function readFileSafe(filePath: string, maxBytes = 100_000): string {
    try {
        const stat = fs.statSync(filePath);
        if (stat.size > maxBytes) {
            return `[File too large to read: ${Math.round(stat.size / 1024)}KB — summarize manually]`;
        }
        return fs.readFileSync(filePath, "utf-8");
    } catch {
        return "[Could not read file]";
    }
}

export function scanRepo(repoPath: string): RepoStructure {
    const absoluteRoot = path.resolve(repoPath);

    if (!fs.existsSync(absoluteRoot)) {
        throw new Error(`Path does not exist: ${absoluteRoot}`);
    }

    const files = collectFiles(absoluteRoot, absoluteRoot);
    const projectName = path.basename(absoluteRoot);
    const tree = `${projectName}/\n` + buildTree(absoluteRoot);

    return {
        rootPath: absoluteRoot,
        totalFiles: files.length,
        tree,
        files,
    };
}