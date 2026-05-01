import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { runTool } from "./tools/run.js";
import { listEnvironmentsTool } from "./tools/list-environments.js";
import { listStrategiesTool } from "./tools/list-strategies.js";
import { inspectManifestTool } from "./tools/inspect-manifest.js";
import { clearSnapshotTool } from "./tools/clear-snapshot.js";
import { makeProvisionPersistentTool } from "./tools/provision-persistent.js";
import { makeDestroyTool } from "./tools/destroy.js";
import { makeListInstancesTool } from "./tools/list-instances.js";
import { LiveInstanceManager } from "../core/live-instances.js";
import { silentLogger } from "../core/logger.js";

interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  handler: (args: never) => Promise<unknown>;
}

export async function startMcpServer(): Promise<void> {
  const liveManager = new LiveInstanceManager({ logger: silentLogger });

  const tools: Tool[] = [
    runTool as Tool,
    listEnvironmentsTool as Tool,
    listStrategiesTool as Tool,
    inspectManifestTool as Tool,
    clearSnapshotTool as Tool,
    makeProvisionPersistentTool(liveManager) as Tool,
    makeDestroyTool(liveManager) as Tool,
    makeListInstancesTool(liveManager) as Tool,
  ];

  const server = new Server(
    { name: "wpfresh", version: "0.1.0-alpha.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find((t) => t.name === req.params.name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
        isError: true,
      };
    }
    try {
      const result = await tool.handler((req.params.arguments ?? {}) as never);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message ?? String(e)}` }],
        isError: true,
      };
    }
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await liveManager.shutdownAll();
    } catch {
      // best-effort cleanup
    }
    process.exit(signal === "SIGINT" ? 130 : 0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
