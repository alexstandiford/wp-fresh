import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { loadEnvironmentsFromDir } from "../../core/loader.js";
import { matchesTagSelector } from "../../core/tag-selector.js";
import type { TagSelector } from "../../schemas/run.js";

interface ListEnvironmentsInput {
  project_dir: string;
  tags?: TagSelector;
}

export const listEnvironmentsTool = {
  name: "list_environments",
  description:
    "List wp-fresh environments declared in a project. Reads JSON files from " +
    "<project_dir>/wpfresh/environments/. Optionally filter by tag selector " +
    "({ all: [...], any: [...], none: [...] }). Use this BEFORE running anything to see what " +
    "environments are configured (e.g. siren-bare, siren-woocommerce) and pick the right ones " +
    "for the run.environments selection. Returns id, description, tags, wp_version, and php_version " +
    "for each match.",
  inputSchema: {
    type: "object" as const,
    properties: {
      project_dir: {
        type: "string",
        description: "Absolute or cwd-relative path to the project root containing wpfresh/environments/",
      },
      tags: {
        type: "object",
        description: "Optional tag selector to filter the catalog",
        additionalProperties: false,
        properties: {
          all: { type: "array", items: { type: "string" } },
          any: { type: "array", items: { type: "string" } },
          none: { type: "array", items: { type: "string" } },
        },
      },
    },
    required: ["project_dir"],
    additionalProperties: false,
  },
  async handler(args: ListEnvironmentsInput): Promise<unknown> {
    const projectDir = resolve(args.project_dir);
    const envDir = join(projectDir, "wpfresh", "environments");
    if (!existsSync(envDir)) {
      return { environments: [], note: `No environment directory at ${envDir}` };
    }
    const all = await loadEnvironmentsFromDir(envDir);
    const filtered = args.tags
      ? all.filter((e) => matchesTagSelector(e.env.tags ?? [], args.tags!))
      : all;
    return {
      project_dir: projectDir,
      environments: filtered.map((e) => ({
        id: e.env.id,
        description: e.env.description,
        tags: e.env.tags ?? [],
        blueprint: e.env.blueprint,
        wp_version: e.env.wp_version ?? "latest",
        php_version: e.env.php_version ?? "8.3",
      })),
    };
  },
};
