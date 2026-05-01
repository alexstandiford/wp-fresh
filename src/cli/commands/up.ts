import { resolve, join, basename } from "node:path";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { loadEnvironment } from "../../core/loader.js";
import {
  LiveInstanceManager,
  loadBlueprintFromPath,
  type LoadedBlueprint,
} from "../../core/live-instances.js";
import { consoleLogger } from "../../core/logger.js";
import type { Environment } from "../../schemas/environment.js";

export interface UpCommandOptions {
  envId?: string;
  blueprint?: string;
  wpVersion?: string;
  phpVersion?: string;
  projectDir?: string;
  ttlSeconds?: number;
}

export async function upCommand(opts: UpCommandOptions): Promise<number> {
  const logger = consoleLogger;
  const projectDir = resolve(opts.projectDir ?? process.cwd());

  let env: Environment;
  let envPath: string | undefined;
  let blueprint: LoadedBlueprint | undefined;

  if (opts.envId) {
    if (opts.blueprint) {
      logger.error("--blueprint cannot be combined with an env id; pick one");
      return 1;
    }
    const envFile = join(projectDir, "wpfresh", "environments", `${opts.envId}.json`);
    if (!existsSync(envFile)) {
      logger.error(`Environment not found: ${envFile}`);
      return 1;
    }
    const loaded = await loadEnvironment(envFile);
    env = loaded.env;
    envPath = loaded.path;
  } else {
    const wp = opts.wpVersion ?? "latest";
    const php = opts.phpVersion ?? "8.3";
    if (opts.blueprint) {
      const abs = resolve(opts.blueprint);
      if (!existsSync(abs)) {
        logger.error(`Blueprint path not found: ${abs}`);
        return 1;
      }
      blueprint = await loadBlueprintFromPath(abs);
      const tag = createHash("sha256").update(abs).digest("hex").slice(0, 8);
      env = {
        id: `adhoc-${basename(abs).replace(/[^a-z0-9-]/gi, "-").toLowerCase()}-${tag}`.slice(0, 60),
        description: `Ad-hoc instance from ${abs}`,
        blueprint: abs,
        wp_version: wp,
        php_version: php,
      };
    } else {
      blueprint = { forCacheKey: {}, forProvision: {} };
      env = {
        id: "adhoc-vanilla",
        description: "Ad-hoc vanilla WordPress instance",
        blueprint: "(vanilla)",
        wp_version: wp,
        php_version: php,
      };
    }
  }

  const manager = new LiveInstanceManager({ logger });

  let shuttingDown = false;
  const teardown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stderr.write(`\nReceived ${signal}, shutting down…\n`);
    try {
      await manager.shutdownAll();
    } catch (e) {
      process.stderr.write(`shutdown error: ${(e as Error).message ?? String(e)}\n`);
    }
    process.exit(signal === "SIGINT" ? 130 : 0);
  };
  process.on("SIGINT", () => void teardown("SIGINT"));
  process.on("SIGTERM", () => void teardown("SIGTERM"));

  let meta;
  try {
    meta = await manager.provision({
      env,
      envPath,
      blueprint,
      projectDir,
      ttlSeconds: opts.ttlSeconds,
    });
  } catch (e) {
    logger.error("provision failed", { error: (e as Error).message ?? String(e) });
    await manager.shutdownAll();
    return 1;
  }

  process.stdout.write(
    [
      "",
      `  env:        ${meta.env_id}`,
      `  url:        ${meta.url}`,
      `  admin:      ${meta.admin_user} / ${meta.admin_password}`,
      `  instance:   ${meta.instance_id}`,
      `  snapshot:   ${meta.snapshot_key}`,
      meta.expires_at ? `  expires:    ${meta.expires_at}` : `  expires:    never (no TTL)`,
      "",
      "Press Ctrl+C to tear down.",
      "",
    ].join("\n"),
  );

  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (manager.count() === 0) {
        clearInterval(check);
        resolve();
      }
    }, 500);
  });
  process.stdout.write("Instance expired, exiting.\n");
  return 0;
}
