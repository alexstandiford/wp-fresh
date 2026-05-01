import type { LiveInstanceManager } from "../../core/live-instances.js";

interface DestroyInput {
  instance_id: string;
}

export function makeDestroyTool(manager: LiveInstanceManager) {
  return {
    name: "destroy",
    description:
      "Destroy a persistent instance previously created via provision_persistent. Disposes " +
      "the Playground server and releases its snapshot lock. Returns { destroyed: boolean } — " +
      "false means no instance with that id was tracked (already gone or never existed).",
    inputSchema: {
      type: "object" as const,
      properties: {
        instance_id: {
          type: "string",
          description: "Instance id returned by provision_persistent.",
        },
      },
      required: ["instance_id"],
      additionalProperties: false,
    },
    async handler(args: DestroyInput): Promise<{ destroyed: boolean }> {
      const destroyed = await manager.destroy(args.instance_id);
      return { destroyed };
    },
  };
}
