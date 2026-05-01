import { defaultRegistry } from "../registry-helper.js";

export const listStrategiesTool = {
  name: "list_strategies",
  description:
    "List all built-in strategies available to the run tool. Each strategy entry includes " +
    "its id (used as the `ref` field in a run's strategies array), a description of when to use " +
    "it, and a JSON Schema describing its config shape. Call this BEFORE constructing a run so " +
    "you know what strategies exist and how to configure them. Built-ins include smoke (URL " +
    "probing), capture (Playwright screenshots), and composite (sequence other strategies with runIf).",
  inputSchema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false,
  },
  async handler(): Promise<unknown> {
    const registry = defaultRegistry();
    return {
      strategies: registry.list().map((s) => ({
        id: s.id,
        description: s.description,
        config_schema: s.configSchema,
      })),
    };
  },
};
