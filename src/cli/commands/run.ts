import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { loadEnvironment, loadEnvironmentsFromDir, loadRun } from "../../core/loader.js";
import { executeRun, type EnvironmentEntry } from "../../core/runner.js";
import { StrategyRegistry } from "../../core/strategy-registry.js";
import { smokeStrategy } from "../../strategies/smoke.js";
import { captureStrategy } from "../../strategies/capture.js";
import { compositeStrategy } from "../../strategies/composite.js";
import { SnapshotStore } from "../../core/snapshot-store.js";
import { consoleLogger } from "../../core/logger.js";

export interface RunCommandOptions {
  env?: string;
  envDir?: string;
  run: string;
  snapshot?: boolean;
}

export async function runCommand(opts: RunCommandOptions): Promise<number> {
  const logger = consoleLogger;

  const catalog = new Map<string, EnvironmentEntry>();
  if (opts.env) {
    const loaded = await loadEnvironment(opts.env);
    catalog.set(loaded.env.id, loaded);
  } else {
    const dir = opts.envDir ?? resolve("./wpfresh/environments");
    if (!existsSync(dir)) {
      logger.error(`Environment directory not found: ${dir}`);
      return 1;
    }
    for (const e of await loadEnvironmentsFromDir(dir)) {
      catalog.set(e.env.id, e);
    }
  }

  if (catalog.size === 0) {
    logger.error("no environments loaded");
    return 1;
  }

  const run = await loadRun(opts.run);

  const registry = new StrategyRegistry();
  registry.register(smokeStrategy);
  registry.register(captureStrategy);
  registry.register(compositeStrategy);

  const snapshotStore = opts.snapshot === false ? undefined : new SnapshotStore();

  const manifest = await executeRun(run, {
    registry,
    environments: catalog,
    snapshotStore,
    logger,
  });

  return manifest.summary.failed_environments === 0 ? 0 : 1;
}
