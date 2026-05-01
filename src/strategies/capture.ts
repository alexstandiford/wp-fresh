import { Type, type Static } from "@sinclair/typebox";
import { mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { Strategy, StrategyContext, StrategyResult } from "./types.js";

const CaptureUrl = Type.Object(
  {
    path: Type.String(),
    name: Type.String({
      pattern: "^[a-z0-9][a-z0-9-]*$",
      description: "Filename slug for the screenshot (kebab-case)",
    }),
    auth: Type.Optional(Type.Boolean({ default: false })),
    wait_for_selector: Type.Optional(
      Type.String({ description: "CSS selector to wait for before capturing" }),
    ),
  },
  { additionalProperties: false },
);

export const CaptureConfig = Type.Object(
  {
    resolution: Type.Optional(
      Type.String({
        pattern: "^[0-9]+x[0-9]+$",
        default: "1280x800",
        description: "Viewport size as WIDTHxHEIGHT (e.g. 1280x800, 1920x1080)",
      }),
    ),
    format: Type.Optional(
      Type.Union([Type.Literal("png"), Type.Literal("jpeg")], { default: "png" }),
    ),
    full_page: Type.Optional(
      Type.Boolean({ default: false, description: "Capture full scrollable page" }),
    ),
    urls: Type.Array(CaptureUrl, { minItems: 1 }),
  },
  {
    $id: "wpfresh/strategies/capture.config.schema.json",
    additionalProperties: false,
  },
);

export type CaptureConfig = Static<typeof CaptureConfig>;

export interface ScreenshotResult {
  path: string;
  name: string;
  file: string;
  resolution: string;
  bytes: number;
  navigated: boolean;
  error?: string;
}

export function parseResolution(r: string): { width: number; height: number } {
  const m = /^(\d+)x(\d+)$/.exec(r);
  if (!m) throw new Error(`invalid resolution: ${r}`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

export const captureStrategy: Strategy<CaptureConfig, { screenshots: ScreenshotResult[] }> = {
  id: "capture",
  description:
    "Capture screenshots of URLs using Playwright. Cheap visual check for AI consumers " +
    "(an agent can interpret a screenshot in ~1500 tokens vs tens of thousands for DOM inspection). " +
    "Use after smoke passes to verify no visual regressions, or for marketing image generation.",
  configSchema: CaptureConfig,

  async run(
    ctx: StrategyContext,
    config: CaptureConfig,
  ): Promise<StrategyResult<{ screenshots: ScreenshotResult[] }>> {
    const resolution = config.resolution ?? "1280x800";
    const viewport = parseResolution(resolution);
    const format = config.format ?? "png";
    const fullPage = config.full_page ?? false;

    await mkdir(ctx.outputDir, { recursive: true });

    const screenshots: ScreenshotResult[] = [];
    const artifacts: string[] = [];
    let allPassed = true;

    for (const u of config.urls) {
      const browserCtx = (await ctx.instance.browser({
        auth: u.auth ?? false,
        viewport,
      })) as unknown as import("playwright").BrowserContext;

      let navigated = false;
      let navError: string | undefined;
      const file = resolve(ctx.outputDir, `${u.name}.${format}`);
      const fullUrl = u.path.startsWith("http")
        ? u.path
        : `${ctx.instance.url}${u.path.startsWith("/") ? "" : "/"}${u.path}`;

      try {
        const page = await browserCtx.newPage();
        try {
          try {
            await page.goto(fullUrl, { waitUntil: "networkidle", timeout: 30_000 });
            if (u.wait_for_selector) {
              await page.waitForSelector(u.wait_for_selector, { timeout: 10_000 });
            }
            navigated = true;
          } catch (e) {
            navError = (e as Error).message ?? String(e);
            ctx.logger.warn("capture navigation failed", { url: fullUrl, error: navError });
            allPassed = false;
          }

          await page.screenshot({ path: file, fullPage, type: format });
        } finally {
          await page.close();
        }
      } finally {
        await browserCtx.close();
      }

      const s = await stat(file).catch(() => null);
      screenshots.push({
        path: u.path,
        name: u.name,
        file,
        resolution,
        bytes: s?.size ?? 0,
        navigated,
        error: navError,
      });
      artifacts.push(file);
    }

    return {
      passed: allPassed,
      data: { screenshots },
      artifacts,
    };
  },
};
