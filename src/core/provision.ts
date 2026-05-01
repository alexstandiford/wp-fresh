import { runCLI, type RunCLIServer, type RunCLIArgs } from "@wp-playground/cli";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CookieJar } from "./cookie-jar.js";
import { consoleLogger, type Logger } from "./logger.js";
import type { Environment, EnvironmentAuth } from "../schemas/environment.js";
import type {
  Instance,
  BrowserContext,
  BrowserOptions,
  FetchOptions,
} from "../strategies/types.js";

export interface ProvisionOptions {
  /** Parsed Playground Blueprint object (V1 or V2). */
  blueprint: unknown;
  /** Host path to use as `mount-before-install`. Empty dir → fresh install populates it. Populated → restored. */
  snapshotPath?: string;
  /** Whether the blueprint references local files. Sets `blueprint-may-read-adjacent-files`. */
  blueprintMayReadAdjacentFiles?: boolean;
  logger?: Logger;
}

export interface ProvisionedInstance extends Instance, AsyncDisposable {
  [Symbol.asyncDispose](): Promise<void>;
}

const DEFAULT_AUTH: EnvironmentAuth = { admin_user: "admin", admin_password: "password" };

/**
 * Authenticate via WordPress's form-based login and capture admin session cookies.
 *
 * Playground's auto-login middleware works for the first request but its state
 * (`playground_auto_login_already_happened`) can persist across runCLI calls
 * within the same Node process, making it unreliable for repeated provisioning.
 * Form-based login is deterministic regardless of internal state.
 */
export async function captureAdminCookies(
  baseUrl: string,
  user: string,
  password: string,
): Promise<CookieJar> {
  const jar = new CookieJar();
  jar.set("wordpress_test_cookie", "WP+Cookie+check");

  // Prime the login endpoint with a GET. Playground's auto-login may set
  // session cookies on this first request; if so, we already have a logged-in
  // session and can skip the form POST.
  const primer = await fetch(`${baseUrl}/wp-login.php`, {
    headers: { cookie: jar.toHeader() },
    redirect: "manual",
  });
  jar.ingest(primer.headers);

  if (jar.toEntries().some((c) => c.name.startsWith("wordpress_logged_in_"))) {
    return jar;
  }

  const body = new URLSearchParams({
    log: user,
    pwd: password,
    "wp-submit": "Log In",
    redirect_to: `${baseUrl}/wp-admin/`,
    testcookie: "1",
  });

  const res = await fetch(`${baseUrl}/wp-login.php`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: jar.toHeader(),
    },
    body: body.toString(),
    redirect: "manual",
  });
  jar.ingest(res.headers);

  // A successful login either yields a 302 redirect (with the logged-in
  // cookies set) or, when Playground auto-login already fired, a 200/302
  // with the cookies already present. Verify we have at least one
  // wordpress_logged_in_* cookie before declaring success.
  const hasLoggedIn = jar.toEntries().some((c) => c.name.startsWith("wordpress_logged_in_"));
  if (!hasLoggedIn) {
    const cookieDump = jar
      .toEntries()
      .map((c) => `${c.name}=${c.value.slice(0, 20)}...`)
      .join(", ") || "<none>";
    const setCookieHeader =
      (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    throw new Error(
      `Login to ${baseUrl} failed: no wordpress_logged_in_* cookie returned. ` +
        `status=${res.status} location=${res.headers.get("location") ?? "<none>"} ` +
        `set-cookie-count=${setCookieHeader.length} jar=[${cookieDump}]`,
    );
  }
  return jar;
}

/**
 * Provision a WordPress Playground instance. Returns a disposable Instance with
 * fetch() and browser() helpers wired to the admin session.
 *
 * Caller must dispose: `await using inst = await provision(...)` or call
 * `await inst[Symbol.asyncDispose]()` explicitly.
 */
export async function provision(
  env: Environment,
  options: ProvisionOptions,
): Promise<ProvisionedInstance> {
  const logger = options.logger ?? consoleLogger;
  const auth = env.auth ?? DEFAULT_AUTH;

  const args: RunCLIArgs = {
    command: "start",
    blueprint: options.blueprint as RunCLIArgs["blueprint"],
    wp: env.wp_version ?? "latest",
    php: (env.php_version ?? "8.3") as RunCLIArgs["php"],
    port: 0,
    skipBrowser: true,
    login: true,
    // Disable the multi-worker load balancer; one worker is sufficient for tests
    // and avoids redirect loops we observed with the default auto setting.
    workers: 1,
    // Disable cwd auto-detection so we don't pull the user's project into VFS
    // as a plugin. Mounts we want are explicit.
    autoMount: false,
  };

  // Default to true: blueprints in wpfresh-managed scenarios are trusted by
  // the project and routinely reference local zips via the `bundled` resource.
  args["blueprint-may-read-adjacent-files"] = options.blueprintMayReadAdjacentFiles ?? true;

  // Always provide a working directory. With a snapshot, restore from it.
  // Without, use a fresh tempdir so Playground installs WP with a URL that
  // matches the freshly-assigned port (avoids canonical-URL redirect loops
  // from a stale, previously-shared site directory).
  let ephemeralDir: string | null = null;
  let workingDir: string;
  if (options.snapshotPath) {
    workingDir = options.snapshotPath;
  } else {
    ephemeralDir = await mkdtemp(join(tmpdir(), "wpfresh-"));
    workingDir = ephemeralDir;
  }
  args["mount-before-install"] = [{ vfsPath: "/wordpress", hostPath: workingDir }];

  logger.info("provisioning", {
    wp: args.wp,
    php: args.php,
    workingDir,
    persisted: !!options.snapshotPath,
  });

  const cliServer: RunCLIServer = (await runCLI(args)) as RunCLIServer;
  const url = cliServer.serverUrl;
  const instanceId = randomUUID();
  logger.info("provisioned", { instanceId, url });

  let jar: CookieJar | null = null;
  // Type-erased to avoid a hard dep on playwright types in this file.
  let browserHandle: { close: () => Promise<void>; newContext: (opts: object) => Promise<unknown> } | null =
    null;

  async function ensureCookies(): Promise<CookieJar> {
    if (jar) return jar;
    jar = await captureAdminCookies(url, auth.admin_user, auth.admin_password);
    logger.debug("captured admin cookies", { count: jar.size() });
    return jar;
  }

  const instance: ProvisionedInstance = {
    instanceId,
    url,

    async fetch(path: string, opts: FetchOptions = {}): Promise<Response> {
      const target = path.startsWith("http")
        ? path
        : `${url}${path.startsWith("/") ? "" : "/"}${path}`;
      // Per-request cookie jar so we capture cookies set across the redirect
      // chain (Node's native fetch doesn't preserve them automatically).
      const requestJar = new CookieJar();
      if (opts.auth) {
        const adminJar = await ensureCookies();
        for (const entry of adminJar.toEntries()) requestJar.set(entry.name, entry.value);
      }
      const baseHeaders = new Headers(opts.headers);
      let currentUrl = target;
      const wantManual = opts.redirect === "manual";
      const wantError = opts.redirect === "error";
      const maxHops = 10;
      for (let hop = 0; hop <= maxHops; hop++) {
        const headers = new Headers(baseHeaders);
        if (requestJar.size() > 0) headers.set("cookie", requestJar.toHeader());
        const res = await fetch(currentUrl, {
          method: opts.method ?? "GET",
          headers,
          body: opts.body,
          redirect: "manual",
        });
        requestJar.ingest(res.headers);
        const isRedirect = res.status >= 300 && res.status < 400;
        if (wantManual || !isRedirect) return res;
        if (wantError) throw new Error(`Unexpected redirect from ${currentUrl} to ${res.headers.get("location") ?? "<none>"}`);
        const loc = res.headers.get("location");
        if (!loc) return res;
        currentUrl = new URL(loc, currentUrl).href;
      }
      throw new Error(`Too many redirects from ${target}`);
    },

    async browser(opts: BrowserOptions = {}): Promise<BrowserContext> {
      let playwright: typeof import("playwright");
      try {
        playwright = await import("playwright");
      } catch {
        throw new Error(
          "Playwright is required for browser-based strategies. Install with: npm install playwright",
        );
      }

      if (!browserHandle) {
        const launched = await playwright.chromium.launch();
        browserHandle = {
          close: () => launched.close(),
          newContext: (o) => launched.newContext(o as Parameters<typeof launched.newContext>[0]),
        };
      }

      const ctx = (await browserHandle.newContext({
        viewport: opts.viewport,
        ignoreHTTPSErrors: true,
      })) as import("playwright").BrowserContext;

      if (opts.auth) {
        const cookies = await ensureCookies();
        const u = new URL(url);
        await ctx.addCookies(
          cookies.toEntries().map((c) => ({
            name: c.name,
            value: c.value,
            domain: u.hostname,
            path: "/",
          })),
        );
      }

      return ctx as unknown as BrowserContext;
    },

    async [Symbol.asyncDispose]() {
      if (browserHandle) {
        try {
          await browserHandle.close();
        } catch (e) {
          logger.warn("browser close failed", { error: String(e) });
        }
        browserHandle = null;
      }
      try {
        await cliServer[Symbol.asyncDispose]();
      } catch (e) {
        logger.warn("playground dispose failed", { error: String(e) });
      }
      if (ephemeralDir) {
        try {
          await rm(ephemeralDir, { recursive: true, force: true });
        } catch (e) {
          logger.warn("ephemeral dir cleanup failed", { error: String(e), dir: ephemeralDir });
        }
      }
      logger.info("disposed", { instanceId });
    },
  };

  return instance;
}
