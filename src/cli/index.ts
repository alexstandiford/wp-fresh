import { Command } from "commander";
import { runCommand } from "./commands/run.js";
import { upCommand } from "./commands/up.js";
import { startMcpServer } from "../mcp/index.js";

const program = new Command();

program
  .name("wpfresh")
  .description("Fleet manager for ephemeral WordPress test environments")
  .version("0.1.0-alpha.0");

program
  .command("run")
  .description("Execute a run against one or more environments")
  .option("-e, --env <path>", "Path to a single environment file (overrides --env-dir)")
  .option(
    "-d, --env-dir <dir>",
    "Directory of environment files",
    "./wpfresh/environments",
  )
  .requiredOption("-r, --run <path>", "Path to a run file")
  .option("--no-snapshot", "Disable snapshot caching (always run blueprint fresh)")
  .action(async (opts) => {
    const code = await runCommand(opts);
    process.exit(code);
  });

program
  .command("up [envId]")
  .description(
    "Provision a persistent instance and hold it open until Ctrl+C. " +
      "With no envId, spins up a fresh WordPress install (optionally with --blueprint).",
  )
  .option(
    "-p, --project-dir <dir>",
    "Project root that contains wpfresh/environments/ (defaults to cwd; only used with envId)",
  )
  .option(
    "-b, --blueprint <path>",
    "Path to a Playground blueprint JSON file or bundle directory (ad-hoc mode only)",
  )
  .option("--wp <version>", "WordPress version for ad-hoc mode (default: latest)")
  .option("--php <version>", "PHP version for ad-hoc mode (default: 8.3)")
  .option(
    "--ttl <seconds>",
    "Auto-destroy after N seconds (default: never; use Ctrl+C to tear down)",
    (v) => parseInt(v, 10),
  )
  .action(
    async (
      envId: string | undefined,
      opts: {
        projectDir?: string;
        blueprint?: string;
        wp?: string;
        php?: string;
        ttl?: number;
      },
    ) => {
      const code = await upCommand({
        envId,
        projectDir: opts.projectDir,
        blueprint: opts.blueprint,
        wpVersion: opts.wp,
        phpVersion: opts.php,
        ttlSeconds: opts.ttl,
      });
      process.exit(code);
    },
  );

program
  .command("mcp")
  .description("Start the wp-fresh MCP server over stdio (for Claude Code etc)")
  .action(async () => {
    await startMcpServer();
  });

await program.parseAsync(process.argv);
