import { rm, readFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { loadEnvironment } from "../../core/loader.js";
import { deriveSnapshotKey, SnapshotStore } from "../../core/snapshot-store.js";

interface ClearSnapshotInput {
  project_dir: string;
  env_id: string;
}

export const clearSnapshotTool = {
  name: "clear_snapshot",
  description:
    "Delete the cached snapshot for a given environment id. Forces the next run against this " +
    "environment to install WordPress fresh from the blueprint. Use after editing a blueprint when " +
    "the cache key wouldn't otherwise change, or to recover from a corrupted snapshot.",
  inputSchema: {
    type: "object" as const,
    properties: {
      project_dir: {
        type: "string",
        description: "Absolute path to the project root",
      },
      env_id: {
        type: "string",
        description: "Environment id (matches the id field in the environment JSON)",
      },
    },
    required: ["project_dir", "env_id"],
    additionalProperties: false,
  },
  async handler(args: ClearSnapshotInput): Promise<unknown> {
    const envDir = join(resolve(args.project_dir), "wpfresh", "environments");
    if (!existsSync(envDir)) {
      throw new Error(`Environment directory not found: ${envDir}`);
    }
    const envPath = join(envDir, `${args.env_id}.json`);
    if (!existsSync(envPath)) {
      throw new Error(`Environment file not found: ${envPath}`);
    }
    const { env } = await loadEnvironment(envPath);
    const blueprintPath = resolve(dirname(envPath), env.blueprint);
    const blueprint = JSON.parse(await readFile(blueprintPath, "utf8"));

    const key = deriveSnapshotKey({
      blueprint,
      wpVersion: env.wp_version ?? "latest",
      phpVersion: env.php_version ?? "8.3",
    });
    const store = new SnapshotStore();
    const path = join(store.root, key);

    if (existsSync(path)) {
      await rm(path, { recursive: true, force: true });
      return { cleared: true, env_id: args.env_id, key, path };
    }
    return { cleared: false, env_id: args.env_id, key, path, note: "no snapshot existed" };
  },
};
