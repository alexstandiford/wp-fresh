import type { TSchema } from "@sinclair/typebox";
import type { StrategyInvocation } from "../schemas/strategy.js";
import type { StrategyResultEntry } from "../schemas/manifest.js";
import type { Logger } from "../core/logger.js";

/**
 * A strategy is a pluggable operation that runs against a provisioned WordPress instance.
 * Strategies don't share state within a run; sequencing via runIf is the only coordination.
 */
export interface Strategy<TConfig = unknown, TData = unknown> {
  id: string;
  /** Shown to the agent via list_strategies(). Primary UX surface for an MCP consumer. */
  description: string;
  /** TypeBox schema validated at runtime and exposed to MCP consumers. */
  configSchema: TSchema;
  run(ctx: StrategyContext, config: TConfig): Promise<StrategyResult<TData>>;
}

export interface StrategyContext {
  instance: Instance;
  /** Run + strategy-scoped output directory. Strategies write artifacts here. */
  outputDir: string;
  runId: string;
  envId: string;
  logger: Logger;
  /**
   * Run a sub-strategy with the same instance/output dir/registry. Composites
   * pass their own accumulated prior list so runIf evaluates against the
   * composite's internal sequence, not the outer run's.
   */
  runStrategy(invocation: StrategyInvocation, prior: StrategyResultEntry[]): Promise<StrategyResultEntry>;
}

export interface StrategyResult<TData = unknown> {
  passed: boolean;
  data?: TData;
  artifacts?: string[];
  /** Reason if passed=false. */
  error?: string;
}

export interface FetchOptions {
  auth?: boolean;
  method?: string;
  body?: BodyInit;
  headers?: HeadersInit;
  redirect?: RequestRedirect;
}

export interface BrowserOptions {
  auth?: boolean;
  viewport?: { width: number; height: number };
}

/**
 * Structural type compatible with playwright.BrowserContext.
 * Defined here to avoid a hard dependency on playwright -- strategies that use it
 * may import the real type themselves.
 */
export interface BrowserContext {
  newPage(): Promise<unknown>;
  close(): Promise<void>;
}

export interface Instance {
  instanceId: string;
  url: string;
  /** HTTP request to a path on the instance. auth=true seeds the admin session cookie. */
  fetch(path: string, opts?: FetchOptions): Promise<Response>;
  /**
   * Launch (or reuse) a Playwright browser and return a fresh BrowserContext.
   * auth=true seeds the admin session cookie on the context. Throws if Playwright
   * is not installed.
   */
  browser(opts?: BrowserOptions): Promise<BrowserContext>;
}
