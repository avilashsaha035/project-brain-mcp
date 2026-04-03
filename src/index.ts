import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerScanStructure } from "./tools/scanStructure.js";
import { registerIdentifyKeyFiles } from "./tools/identifyKeyFiles.js";
import { registerExplainAuthFlow } from "./tools/explainAuthFlow.js";
import { registerAskCodebase } from "./tools/askCodebase.js";

// ── Create the MCP server ──────────────────────────────────────────
const server = new McpServer({
    name: "project-brain-mcp",
    version: "1.0.0",
});

// ── Register all tools ─────────────────────────────────────────────
registerScanStructure(server);
registerIdentifyKeyFiles(server);
registerExplainAuthFlow(server);
registerAskCodebase(server);

// ── Connect via stdio (Claude Desktop / CLI usage) ─────────────────
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Project Brain MCP server running on stdio");
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});