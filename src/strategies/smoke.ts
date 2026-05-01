import { Type, type Static } from "@sinclair/typebox";
import type { Strategy, StrategyContext, StrategyResult } from "./types.js";

const SmokeUrl = Type.Object(
  {
    path: Type.String({ description: "Path on the instance, e.g. /wp-admin/" }),
    name: Type.Optional(Type.String({ description: "Friendly identifier for the manifest" })),
    auth: Type.Optional(
      Type.Boolean({
        default: false,
        description: "Send the admin session cookie",
      }),
    ),
    expect_status: Type.Optional(
      Type.Integer({ minimum: 100, maximum: 599, default: 200 }),
    ),
  },
  { additionalProperties: false },
);

const SmokeFailOn = Type.Union([
  Type.Literal("php_fatal"),
  Type.Literal("5xx"),
  Type.Literal("4xx"),
  Type.Literal("white_screen"),
  Type.Literal("php_warning"),
  Type.Literal("php_notice"),
]);

export const SmokeConfig = Type.Object(
  {
    urls: Type.Array(SmokeUrl, { minItems: 1 }),
    fail_on: Type.Optional(
      Type.Array(SmokeFailOn, {
        default: ["php_fatal", "5xx", "white_screen"],
        description: "Which body/status patterns count as failures",
      }),
    ),
  },
  {
    $id: "wpfresh/strategies/smoke.config.schema.json",
    additionalProperties: false,
  },
);

export type SmokeConfig = Static<typeof SmokeConfig>;

interface UrlResult {
  path: string;
  name?: string;
  status?: number;
  passed: boolean;
  failures: string[];
}

const PHP_FATAL_RE = /(?:fatal error|php fatal error|uncaught (?:error|throwable))[:\s<]/i;
const PHP_WARNING_RE = /<b>\s*(?:php\s+)?warning\s*<\/b>:/i;
const PHP_NOTICE_RE = /<b>\s*(?:php\s+)?notice\s*<\/b>:/i;

export const smokeStrategy: Strategy<SmokeConfig, { urls: UrlResult[] }> = {
  id: "smoke",
  description:
    "Probe a list of URLs on the instance and check status codes plus body for PHP errors. " +
    "Use as the cheap first-pass to decide whether a build is broken before running expensive UI checks. " +
    "Default failure conditions: PHP fatal in body, 5xx status, or white screen on a 200.",
  configSchema: SmokeConfig,

  async run(ctx: StrategyContext, config: SmokeConfig): Promise<StrategyResult<{ urls: UrlResult[] }>> {
    const failOn = new Set(config.fail_on ?? ["php_fatal", "5xx", "white_screen"]);
    const urls: UrlResult[] = [];
    let allPassed = true;

    for (const u of config.urls) {
      const expectStatus = u.expect_status ?? 200;
      const failures: string[] = [];

      let status: number | undefined;
      let body = "";
      try {
        const res = await ctx.instance.fetch(u.path, { auth: u.auth ?? false });
        status = res.status;
        body = await res.text();
      } catch (e) {
        failures.push(`fetch_error: ${(e as Error).message ?? String(e)}`);
        allPassed = false;
        urls.push({ path: u.path, name: u.name, passed: false, failures });
        continue;
      }

      if (status !== expectStatus) {
        failures.push(`status_mismatch: got ${status} expected ${expectStatus}`);
      }
      if (failOn.has("5xx") && status >= 500 && status !== expectStatus) {
        failures.push(`5xx: ${status}`);
      }
      if (failOn.has("4xx") && status >= 400 && status < 500 && status !== expectStatus) {
        failures.push(`4xx: ${status}`);
      }
      if (failOn.has("php_fatal") && PHP_FATAL_RE.test(body)) failures.push("php_fatal");
      if (failOn.has("php_warning") && PHP_WARNING_RE.test(body)) failures.push("php_warning");
      if (failOn.has("php_notice") && PHP_NOTICE_RE.test(body)) failures.push("php_notice");
      if (failOn.has("white_screen") && status === 200 && body.trim().length < 100) {
        failures.push("white_screen");
      }

      const passed = failures.length === 0;
      if (!passed) allPassed = false;
      urls.push({ path: u.path, name: u.name, status, passed, failures });
      ctx.logger.debug("smoke probe", { path: u.path, status, passed, failures });
    }

    return {
      passed: allPassed,
      data: { urls },
    };
  },
};
