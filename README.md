# 🧠 Project Brain MCP

An MCP server that reads any codebase and explains it using AI. Point it at any `github repo url` / `local project folder` and ask questions in plain language.

## 🔧 Tools

| Tool | What it does |
|---|---|
| `scan_repo_structure` | Scans the folder tree + explains the project architecture |
| `identify_key_files` | Finds the most important files for a new developer to read |
| `explain_auth_flow` | Reads auth-related files and explains login, tokens, and permissions |
| `ask_codebase` | Answer any question grounded in the actual code |

## 🛠️ Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set your API key

```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### 3. Build

```bash
npm run build
```

### 4. Add to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "project-brain": {
      "command": "node",
      "args": ["/absolute/path/to/project-brain-mcp/build/index.js"],
      "env": {
        "GEMINI_API_KEY": "sk-ant-your-key-here"
      }
    }
  }
}
```

Restart Claude Desktop. The 4 tools will appear automatically.

## 📝 Example prompts

```
Scan the structure of https://github.com/username/repo-name

What are the key files I should read in this repo?

Explain the auth flow in /Users/me/projects/my-api

How does payment processing work in /Users/me/projects/my-shop?
```

## 🖥️ Development

```bash
npm run dev   # watch mode (recompiles on save)
npm run build # production build
```
