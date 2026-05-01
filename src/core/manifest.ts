import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Manifest } from "../schemas/manifest.js";

/**
 * Write a Manifest to <dir>/<run_id>.json. Returns the absolute path written.
 * Creates the directory if needed.
 */
export async function writeManifest(manifest: Manifest, dir = "wpfresh-runs"): Promise<string> {
  const out = resolve(dir);
  await mkdir(out, { recursive: true });
  const path = join(out, `${manifest.run_id}.json`);
  await writeFile(path, JSON.stringify(manifest, null, 2) + "\n", { mode: 0o644 });
  return path;
}
