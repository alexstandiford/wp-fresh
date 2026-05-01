import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import lockfile from "proper-lockfile";
import type { Environment } from "../schemas/environment.js";

/**
 * Pinned to @wp-playground/cli major version. A Playground major bump can change
 * the on-disk site format, so the cache key must invalidate.
 */
export const PLAYGROUND_CLI_MAJOR = 3;

/**
 * Canonicalize a value to a stable string for hashing.
 * Object keys are sorted; whitespace is omitted; arrays preserve order.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}

export interface SnapshotKeyInput {
  blueprint: unknown;
  wpVersion: string;
  phpVersion: string;
}

/**
 * Derive a deterministic snapshot cache key. Busts when blueprint contents,
 * wp_version, php_version, or the Playground CLI major version change.
 */
export function deriveSnapshotKey(input: SnapshotKeyInput): string {
  const payload = canonicalize({
    blueprint: input.blueprint,
    wp: input.wpVersion,
    php: input.phpVersion,
    pgcli: PLAYGROUND_CLI_MAJOR,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

export interface AcquiredSnapshot {
  path: string;
  key: string;
  release: () => Promise<void>;
}

export class SnapshotStore {
  constructor(public readonly root: string = join(homedir(), ".wpfresh", "snapshots")) {}

  /**
   * Reserve the snapshot directory for an environment+blueprint pair. Creates
   * the directory (mode 0700) if it doesn't exist and acquires an exclusive
   * file lock for the lifetime of the returned handle.
   *
   * The first call for a given key returns an empty dir; Playground's
   * `mount-before-install` populates it on first run. Subsequent calls return
   * the populated dir, which Playground restores in place.
   */
  async acquire(env: Environment, blueprint: unknown): Promise<AcquiredSnapshot> {
    const key = deriveSnapshotKey({
      blueprint,
      wpVersion: env.wp_version ?? "latest",
      phpVersion: env.php_version ?? "8.3",
    });
    const path = join(this.root, key);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await mkdir(path, { recursive: true, mode: 0o700 });

    const release = await lockfile.lock(path, {
      realpath: false,
      retries: { retries: 5, minTimeout: 500, maxTimeout: 2000 },
      stale: 60_000,
    });

    return { path, key, release };
  }
}
