import { readFile, stat } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { NodeJsFilesystem } from "@wp-playground/storage";
import { randomUUID } from "node:crypto";
import { provision } from "./provision.js";
import { writeManifest } from "./manifest.js";
import { matchesTagSelector } from "./tag-selector.js";
import { consoleLogger, type Logger } from "./logger.js";
import { StrategyRegistry } from "./strategy-registry.js";
import type { SnapshotStore } from "./snapshot-store.js";
import type { Environment } from "../schemas/environment.js";
import type { Run, EnvironmentSelection } from "../schemas/run.js";
import type { StrategyInvocation, RunIf } from "../schemas/strategy.js";
import type {
  Manifest,
  EnvironmentResult,
  StrategyResultEntry,
} from "../schemas/manifest.js";
import type { StrategyContext, StrategyResult, Instance } from "../strategies/types.js";

export interface EnvironmentEntry {
  env: Environment;
  /** Absolute path to the environment file (used to resolve relative blueprint paths) */
  path: string;
}

export interface RunOptions {
  registry: StrategyRegistry;
  /** Map of environment id → loaded environment + path */
  environments: Map<string, EnvironmentEntry>;
  /** If present, environments are provisioned through cached snapshots. */
  snapshotStore?: SnapshotStore;
  /** Optional override of where wpfresh-runs/ manifests land. */
  manifestsDir?: string;
  /** Optional override of where strategy artifacts (screenshots etc) land. */
  artifactsRoot?: string;
  logger?: Logger;
}

export async function executeRun(run: Run, options: RunOptions): Promise<Manifest> {
  const logger = options.logger ?? consoleLogger;
  const runId = randomUUID();
  const startedAt = new Date().toISOString();

  const targets = resolveTargets(run.environments, options.environments);
  if (targets.length === 0) {
    logger.warn("no environments matched selection", {
      ids: run.environments.ids,
      tags: run.environments.tags,
    });
  }

  const results: EnvironmentResult[] = [];
  for (const target of targets) {
    const result = await executeAgainstEnvironment(target, run, runId, options);
    results.push(result);
  }

  const completedAt = new Date().toISOString();
  const summary = {
    total_environments: results.length,
    passed_environments: results.filter((r) => r.passed).length,
    failed_environments: results.filter((r) => !r.passed).length,
  };

  const manifest: Manifest = {
    run_id: runId,
    started_at: startedAt,
    completed_at: completedAt,
    run_config: run as unknown as Record<string, unknown>,
    results,
    summary,
  };

  const manifestPath = await writeManifest(manifest, options.manifestsDir);
  logger.info("manifest written", {
    path: manifestPath,
    passed: summary.passed_environments,
    failed: summary.failed_environments,
  });
  return manifest;
}

function resolveTargets(
  selection: EnvironmentSelection,
  catalog: Map<string, EnvironmentEntry>,
): EnvironmentEntry[] {
  const matched = new Map<string, EnvironmentEntry>();

  if (selection.ids) {
    for (const id of selection.ids) {
      const entry = catalog.get(id);
      if (entry) matched.set(id, entry);
    }
  }

  if (selection.tags) {
    for (const [id, entry] of catalog) {
      if (matchesTagSelector(entry.env.tags ?? [], selection.tags)) {
        matched.set(id, entry);
      }
    }
  }

  return Array.from(matched.values());
}

interface LoadedBlueprint {
  /** Parsed blueprint JSON, used for snapshot key derivation */
  forCacheKey: unknown;
  /** What to pass to provision: parsed object for inline blueprints, or NodeJsFilesystem for bundle dirs */
  forProvision: unknown;
}

async function loadBlueprint(envPath: string, blueprintRef: string): Promise<LoadedBlueprint> {
  const fullPath = resolve(dirname(envPath), blueprintRef);
  const stats = await stat(fullPath);
  if (stats.isDirectory()) {
    // Bundle: blueprint.json + adjacent files. Pass a filesystem backend so
    // Playground can resolve `bundled` resources relative to the directory.
    const jsonPath = join(fullPath, "blueprint.json");
    const text = await readFile(jsonPath, "utf8");
    const parsed = JSON.parse(text);
    return { forCacheKey: parsed, forProvision: new NodeJsFilesystem(fullPath) };
  }
  const text = await readFile(fullPath, "utf8");
  const parsed = JSON.parse(text);
  return { forCacheKey: parsed, forProvision: parsed };
}

async function executeAgainstEnvironment(
  target: EnvironmentEntry,
  run: Run,
  runId: string,
  options: RunOptions,
): Promise<EnvironmentResult> {
  const logger = options.logger ?? consoleLogger;
  const { env, path: envPath } = target;

  let blueprint: LoadedBlueprint;
  try {
    blueprint = await loadBlueprint(envPath, env.blueprint);
  } catch (e) {
    return {
      environment_id: env.id,
      passed: false,
      error: `blueprint load failed: ${(e as Error).message ?? String(e)}`,
      strategies: [],
    };
  }

  let snapshotPath: string | undefined;
  let releaseSnapshot: (() => Promise<void>) | undefined;
  if (options.snapshotStore) {
    try {
      const acquired = await options.snapshotStore.acquire(env, blueprint.forCacheKey);
      snapshotPath = acquired.path;
      releaseSnapshot = acquired.release;
      logger.info("snapshot acquired", { envId: env.id, key: acquired.key });
    } catch (e) {
      return {
        environment_id: env.id,
        passed: false,
        error: `snapshot acquire failed: ${(e as Error).message ?? String(e)}`,
        strategies: [],
      };
    }
  }

  const provisionedAt = new Date().toISOString();
  let inst: Awaited<ReturnType<typeof provision>>;
  try {
    inst = await provision(env, { blueprint: blueprint.forProvision, snapshotPath, logger });
  } catch (e) {
    if (releaseSnapshot) await releaseSnapshot();
    return {
      environment_id: env.id,
      passed: false,
      error: `provision failed: ${(e as Error).message ?? String(e)}`,
      strategies: [],
    };
  }

  const strategyResults: StrategyResultEntry[] = [];
  let allPassed = true;
  const artifactsRoot = options.artifactsRoot ?? "wpfresh-screenshots";

  try {
    const ctx: StrategyExecutionContext = {
      registry: options.registry,
      instance: inst,
      outputDirRoot: `${artifactsRoot}/${runId}/${env.id}`,
      runId,
      envId: env.id,
      logger,
    };

    for (const invocation of run.strategies) {
      const result = await runStrategyInvocation(invocation, strategyResults, ctx);
      strategyResults.push(result);
      if (!result.skipped && !result.passed) allPassed = false;
    }
  } finally {
    await inst[Symbol.asyncDispose]();
    if (releaseSnapshot) {
      try {
        await releaseSnapshot();
      } catch (e) {
        logger.warn("snapshot release failed", { error: String(e) });
      }
    }
  }

  return {
    environment_id: env.id,
    instance_id: inst.instanceId,
    provisioned_at: provisionedAt,
    passed: allPassed,
    strategies: strategyResults,
  };
}

interface StrategyExecutionContext {
  registry: StrategyRegistry;
  instance: Instance;
  outputDirRoot: string;
  runId: string;
  envId: string;
  logger: Logger;
}

/**
 * Execute a single strategy invocation against an instance, evaluating runIf
 * against the supplied prior result list. Public so composite strategies can
 * reuse the same sequencing semantics.
 */
export async function runStrategyInvocation(
  invocation: StrategyInvocation,
  prior: StrategyResultEntry[],
  ctx: StrategyExecutionContext,
): Promise<StrategyResultEntry> {
  const startedAt = new Date().toISOString();
  const runIf: RunIf = invocation.runIf ?? "always";

  if (!shouldRun(runIf, prior)) {
    const completedAt = new Date().toISOString();
    return {
      ref: invocation.ref,
      passed: false,
      skipped: true,
      skip_reason: `runIf=${runIf}`,
      started_at: startedAt,
      completed_at: completedAt,
    };
  }

  const strategy = ctx.registry.get(invocation.ref);
  if (!strategy) {
    return {
      ref: invocation.ref,
      passed: false,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      data: { error: `unknown strategy: ${invocation.ref}` },
    };
  }

  const strategyCtx: StrategyContext = {
    instance: ctx.instance,
    outputDir: `${ctx.outputDirRoot}/${strategy.id}`,
    runId: ctx.runId,
    envId: ctx.envId,
    logger: ctx.logger,
    runStrategy: async (
      sub: StrategyInvocation,
      subPrior: StrategyResultEntry[],
    ): Promise<StrategyResultEntry> => {
      return runStrategyInvocation(sub, subPrior, ctx);
    },
  };

  let result: StrategyResult;
  try {
    result = await strategy.run(strategyCtx, (invocation.config ?? {}) as never);
  } catch (e) {
    return {
      ref: invocation.ref,
      passed: false,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      data: { error: (e as Error).message ?? String(e) },
    };
  }

  return {
    ref: invocation.ref,
    passed: result.passed,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    data: result.data as Record<string, unknown> | undefined,
    artifacts: result.artifacts,
  };
}

function shouldRun(runIf: RunIf, prior: StrategyResultEntry[]): boolean {
  const lastNonSkipped = [...prior].reverse().find((r) => !r.skipped);
  switch (runIf) {
    case "always":
      return true;
    case "previous-passed":
      return lastNonSkipped ? lastNonSkipped.passed : true;
    case "previous-failed":
      return lastNonSkipped ? !lastNonSkipped.passed : false;
    case "all-passed":
      return prior.filter((r) => !r.skipped).every((r) => r.passed);
    default:
      return true;
  }
}
