import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { loadEnvironment } from "../../core/loader.js";
import type { LiveInstanceManager, LiveInstanceMeta } from "../../core/live-instances.js";

interface ProvisionPersistentInput {
  project_dir: string;
  env_id: string;
  ttl_seconds?: number;
}

const DEFAULT_TTL_SECONDS = 30 * 60;

export function makeProvisionPersistentTool(manager: LiveInstanceManager) {
  return {
    name: "provision_persistent",
    description:
      "Provision a WordPress Playground instance and keep it running until destroy is called " +
      "(or the TTL expires). Use this when you want to interact with a live admin/frontend " +
      "to troubleshoot a failing smoke, exercise a flow manually, or hand the URL+credentials " +
      "to another tool. Returns { instance_id, url, admin_user, admin_password, expires_at, " +
      "snapshot_key }. The same env_id+project_dir combo will reuse an existing instance " +
      "rather than provision a new one. Always pair with destroy(instance_id) when finished.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_dir: {
          type: "string",
          description: "Absolute path to the project root that contains wpfresh/environments/",
        },
        env_id: {
          type: "string",
          description: "Environment id (matches the file name <id>.json in wpfresh/environments/).",
        },
        ttl_seconds: {
          type: "number",
          description:
            "Optional TTL in seconds. After this elapses the instance is destroyed automatically. " +
            "Default 1800 (30 min). Set 0 for no TTL (instance lives until destroyed or the MCP " +
            "server exits).",
          minimum: 0,
        },
      },
      required: ["project_dir", "env_id"],
      additionalProperties: false,
    },
    async handler(args: ProvisionPersistentInput): Promise<LiveInstanceMeta> {
      const projectDir = resolve(args.project_dir);
      const envFile = join(projectDir, "wpfresh", "environments", `${args.env_id}.json`);
      if (!existsSync(envFile)) {
        throw new Error(`Environment not found: ${envFile}`);
      }
      const loaded = await loadEnvironment(envFile);
      const ttl =
        args.ttl_seconds === 0
          ? undefined
          : args.ttl_seconds ?? DEFAULT_TTL_SECONDS;
      return manager.provision({
        env: loaded.env,
        envPath: loaded.path,
        projectDir,
        ttlSeconds: ttl,
      });
    },
  };
}
