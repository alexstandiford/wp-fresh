import { readFile, stat } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { NodeJsFilesystem } from "@wp-playground/storage";
import { provision, type ProvisionedInstance } from "./provision.js";
import { SnapshotStore } from "./snapshot-store.js";
import { consoleLogger, type Logger } from "./logger.js";
import type { Environment, EnvironmentAuth } from "../schemas/environment.js";

export interface LiveInstanceMeta {
  instance_id: string;
  env_id: string;
  project_dir: string;
  url: string;
  admin_user: string;
  admin_password: string;
  started_at: string;
  expires_at: string | null;
  snapshot_key: string;
}

interface LiveInstanceInternal extends LiveInstanceMeta {
  instance: ProvisionedInstance;
  releaseSnapshot?: () => Promise<void>;
  ttlTimer?: ReturnType<typeof setTimeout>;
}

const DEFAULT_AUTH: EnvironmentAuth = { admin_user: "admin", admin_password: "password" };

interface LoadedBlueprint {
  forCacheKey: unknown;
  forProvision: unknown;
}

async function loadBlueprint(envPath: string, blueprintRef: string): Promise<LoadedBlueprint> {
  const fullPath = resolve(dirname(envPath), blueprintRef);
  return loadBlueprintFromPath(fullPath);
}

/**
 * Load a blueprint from an absolute path. If the path points at a directory,
 * the directory is treated as a bundle (must contain blueprint.json) and a
 * NodeJsFilesystem rooted there is passed to Playground so `bundled` resources
 * resolve correctly. If it points at a file, the parsed JSON is used directly.
 */
export async function loadBlueprintFromPath(absolutePath: string): Promise<LoadedBlueprint> {
  const stats = await stat(absolutePath);
  if (stats.isDirectory()) {
    const jsonPath = join(absolutePath, "blueprint.json");
    const text = await readFile(jsonPath, "utf8");
    const parsed = JSON.parse(text);
    return { forCacheKey: parsed, forProvision: new NodeJsFilesystem(absolutePath) };
  }
  const text = await readFile(absolutePath, "utf8");
  const parsed = JSON.parse(text);
  return { forCacheKey: parsed, forProvision: parsed };
}

export type { LoadedBlueprint };

export interface ProvisionPersistentOptions {
  env: Environment;
  /**
   * Path to the env file. Required when `blueprint` is omitted (so the manager
   * can resolve `env.blueprint` against the env file's directory). Optional
   * when `blueprint` is supplied directly.
   */
  envPath?: string;
  /**
   * Pre-loaded blueprint. When supplied, env.blueprint is not loaded or used.
   * `forCacheKey` participates in the snapshot key; `forProvision` is what
   * Playground sees.
   */
  blueprint?: LoadedBlueprint;
  projectDir: string;
  ttlSeconds?: number;
}

/**
 * Manages WordPress Playground instances that persist across MCP tool calls
 * (or for the duration of a CLI `up` command). Each live instance holds a
 * snapshot lock, so concurrent runs against the same env will queue.
 *
 * On process shutdown, call shutdownAll() to release everything cleanly.
 */
export class LiveInstanceManager {
  private instances = new Map<string, LiveInstanceInternal>();
  private snapshotStore: SnapshotStore;
  private logger: Logger;

  constructor(opts: { snapshotStore?: SnapshotStore; logger?: Logger } = {}) {
    this.snapshotStore = opts.snapshotStore ?? new SnapshotStore();
    this.logger = opts.logger ?? consoleLogger;
  }

  findFor(envId: string, projectDir: string): LiveInstanceMeta | null {
    for (const inst of this.instances.values()) {
      if (inst.env_id === envId && inst.project_dir === projectDir) {
        return this.toMeta(inst);
      }
    }
    return null;
  }

  /**
   * Provision a new persistent instance, OR return an existing one for the
   * same env_id + project_dir. Re-use is friendlier for agents that lose
   * track of instance ids and try to reprovision.
   */
  async provision(opts: ProvisionPersistentOptions): Promise<LiveInstanceMeta> {
    const existing = this.findFor(opts.env.id, opts.projectDir);
    if (existing) {
      this.logger.info("reusing live instance", {
        instance_id: existing.instance_id,
        env_id: opts.env.id,
      });
      return existing;
    }

    let blueprint: LoadedBlueprint;
    if (opts.blueprint) {
      blueprint = opts.blueprint;
    } else {
      if (!opts.envPath) {
        throw new Error("provision requires either a preloaded blueprint or an envPath");
      }
      blueprint = await loadBlueprint(opts.envPath, opts.env.blueprint);
    }
    const acquired = await this.snapshotStore.acquire(opts.env, blueprint.forCacheKey);

    let inst: ProvisionedInstance;
    try {
      inst = await provision(opts.env, {
        blueprint: blueprint.forProvision,
        snapshotPath: acquired.path,
        logger: this.logger,
      });
    } catch (e) {
      await acquired.release();
      throw e;
    }

    const auth = opts.env.auth ?? DEFAULT_AUTH;
    const startedAt = new Date();
    const expiresAt = opts.ttlSeconds
      ? new Date(startedAt.getTime() + opts.ttlSeconds * 1000)
      : null;

    const internal: LiveInstanceInternal = {
      instance_id: inst.instanceId,
      env_id: opts.env.id,
      project_dir: opts.projectDir,
      url: inst.url,
      admin_user: auth.admin_user,
      admin_password: auth.admin_password,
      started_at: startedAt.toISOString(),
      expires_at: expiresAt?.toISOString() ?? null,
      snapshot_key: acquired.key,
      instance: inst,
      releaseSnapshot: acquired.release,
    };

    if (opts.ttlSeconds) {
      internal.ttlTimer = setTimeout(() => {
        void this.destroy(internal.instance_id).catch((err) => {
          this.logger.warn("ttl-driven destroy failed", {
            error: String(err),
            instance_id: internal.instance_id,
          });
        });
      }, opts.ttlSeconds * 1000);
      // Don't keep the process alive just for the timer.
      internal.ttlTimer.unref?.();
    }

    this.instances.set(internal.instance_id, internal);
    this.logger.info("provisioned persistent", {
      instance_id: internal.instance_id,
      env_id: opts.env.id,
      url: inst.url,
      ttl: opts.ttlSeconds ?? null,
    });

    return this.toMeta(internal);
  }

  async destroy(instanceId: string): Promise<boolean> {
    const inst = this.instances.get(instanceId);
    if (!inst) return false;
    this.instances.delete(instanceId);
    if (inst.ttlTimer) clearTimeout(inst.ttlTimer);
    try {
      await inst.instance[Symbol.asyncDispose]();
    } catch (e) {
      this.logger.warn("instance dispose failed", {
        error: String(e),
        instance_id: instanceId,
      });
    }
    if (inst.releaseSnapshot) {
      try {
        await inst.releaseSnapshot();
      } catch (e) {
        this.logger.warn("snapshot release failed", {
          error: String(e),
          instance_id: instanceId,
        });
      }
    }
    this.logger.info("destroyed", { instance_id: instanceId });
    return true;
  }

  list(): LiveInstanceMeta[] {
    return Array.from(this.instances.values()).map((i) => this.toMeta(i));
  }

  count(): number {
    return this.instances.size;
  }

  async shutdownAll(): Promise<void> {
    const ids = Array.from(this.instances.keys());
    await Promise.all(ids.map((id) => this.destroy(id)));
  }

  private toMeta(inst: LiveInstanceInternal): LiveInstanceMeta {
    return {
      instance_id: inst.instance_id,
      env_id: inst.env_id,
      project_dir: inst.project_dir,
      url: inst.url,
      admin_user: inst.admin_user,
      admin_password: inst.admin_password,
      started_at: inst.started_at,
      expires_at: inst.expires_at,
      snapshot_key: inst.snapshot_key,
    };
  }
}
