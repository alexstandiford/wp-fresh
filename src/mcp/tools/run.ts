import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { Run as RunSchema } from "../../schemas/run.js";
import { loadEnvironmentsFromDir } from "../../core/loader.js";
import { executeRun, type EnvironmentEntry } from "../../core/runner.js";
import { SnapshotStore } from "../../core/snapshot-store.js";
import { defaultRegistry } from "../registry-helper.js";
import { silentLogger } from "../../core/logger.js";
import type { Run } from "../../schemas/run.js";

type AjvCtor = typeof import("ajv/dist/2020.js");
const AjvImpl = (Ajv2020 as unknown as AjvCtor).default ?? (Ajv2020 as unknown as AjvCtor);
const formatsImpl = (addFormats as unknown as { default?: typeof addFormats }).default ?? addFormats;
const ajv = new AjvImpl({ strict: false, allErrors: true });
formatsImpl(ajv);
const validateRun = ajv.compile(RunSchema);

interface RunToolInput {
  project_dir: string;
  run: Run;
  use_snapshots?: boolean;
}

export const runTool = {
  name: "run",
  description:
    "Execute a run against one or more environments and return the resulting manifest. The run " +
    "is supplied inline (no file needed). Environments referenced by run.environments are loaded " +
    "from <project_dir>/wpfresh/environments/. Snapshots are cached at ~/.wpfresh/snapshots/ and " +
    "reused on subsequent runs unless use_snapshots=false. Use list_environments and " +
    "list_strategies first to discover what's available. The returned manifest summarizes pass/fail " +
    "per environment and contains per-strategy results plus screenshot artifact paths.",
  inputSchema: {
    type: "object" as const,
    properties: {
      project_dir: {
        type: "string",
        description: "Absolute path to the project root that contains wpfresh/environments/",
      },
      run: {
        type: "object",
        description:
          "A run definition matching the wp-fresh Run schema. Must specify environments " +
          "(by ids or tags selector) and a non-empty strategies array.",
      },
      use_snapshots: {
        type: "boolean",
        default: true,
        description: "Whether to use cached snapshots (default true). Set false to always run blueprint cold.",
      },
    },
    required: ["project_dir", "run"],
    additionalProperties: false,
  },
  async handler(args: RunToolInput): Promise<unknown> {
    if (!validateRun(args.run)) {
      throw new Error(
        "Invalid run object:\n" +
          (validateRun.errors ?? [])
            .map((e) => `  ${e.instancePath || "(root)"} ${e.message}`)
            .join("\n"),
      );
    }

    const projectDir = resolve(args.project_dir);
    const envDir = join(projectDir, "wpfresh", "environments");
    if (!existsSync(envDir)) {
      throw new Error(`Environment directory not found: ${envDir}`);
    }

    const catalog = new Map<string, EnvironmentEntry>();
    for (const e of await loadEnvironmentsFromDir(envDir)) {
      catalog.set(e.env.id, e);
    }
    if (catalog.size === 0) throw new Error(`No environments found in ${envDir}`);

    const useSnapshots = args.use_snapshots !== false;
    const snapshotStore = useSnapshots ? new SnapshotStore() : undefined;

    const manifest = await executeRun(args.run, {
      registry: defaultRegistry(),
      environments: catalog,
      snapshotStore,
      manifestsDir: join(projectDir, "wpfresh-runs"),
      artifactsRoot: join(projectDir, "wpfresh-screenshots"),
      logger: silentLogger,
    });

    return manifest;
  },
};
