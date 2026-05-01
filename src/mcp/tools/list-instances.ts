import type { LiveInstanceManager, LiveInstanceMeta } from "../../core/live-instances.js";

export function makeListInstancesTool(manager: LiveInstanceManager) {
  return {
    name: "list_instances",
    description:
      "List all persistent instances currently tracked by this MCP server. Useful when an " +
      "agent loses track of which envs it has open, or wants to clean up before exiting. " +
      "Returns an array of { instance_id, env_id, project_dir, url, admin_user, " +
      "admin_password, started_at, expires_at, snapshot_key }.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      additionalProperties: false,
    },
    async handler(): Promise<{ instances: LiveInstanceMeta[]; count: number }> {
      const instances = manager.list();
      return { instances, count: instances.length };
    },
  };
}
