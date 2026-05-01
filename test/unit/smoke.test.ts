import { describe, it, expect } from "vitest";
import { smokeStrategy } from "../../src/strategies/smoke.js";
import { silentLogger } from "../../src/core/logger.js";
import type { StrategyContext, Instance, FetchOptions } from "../../src/strategies/types.js";

function mockInstance(handler: (path: string, opts?: FetchOptions) => Response | Promise<Response>): Instance {
  return {
    instanceId: "test",
    url: "http://test.local",
    fetch: async (path, opts) => handler(path, opts),
    browser: async () => {
      throw new Error("not available in unit tests");
    },
  };
}

function ctx(instance: Instance): StrategyContext {
  return {
    instance,
    outputDir: "/tmp/wpfresh-test",
    runId: "test-run",
    envId: "test-env",
    logger: silentLogger,
    runStrategy: async () => ({ passed: true }),
  };
}

const okHtml = "<html><body>" + "x".repeat(2000) + "</body></html>";

describe("smoke strategy", () => {
  it("passes when all URLs return expected status with healthy bodies", async () => {
    const inst = mockInstance(() => new Response(okHtml, { status: 200, headers: { "content-type": "text/html" } }));
    const result = await smokeStrategy.run(ctx(inst), {
      urls: [
        { path: "/", expect_status: 200 },
        { path: "/wp-admin/", auth: true, expect_status: 200 },
      ],
    });
    expect(result.passed).toBe(true);
    expect(result.data?.urls).toHaveLength(2);
    expect(result.data?.urls.every((u) => u.passed)).toBe(true);
  });

  it("fails on PHP fatal in body", async () => {
    const fatalBody =
      "<html><body><b>Fatal error</b>: Uncaught Error: Call to undefined function in /wp-content/plugins/x.php on line 1</body></html>";
    const inst = mockInstance(() => new Response(fatalBody, { status: 200 }));
    const result = await smokeStrategy.run(ctx(inst), { urls: [{ path: "/", expect_status: 200 }] });
    expect(result.passed).toBe(false);
    expect(result.data?.urls[0].failures).toContain("php_fatal");
  });

  it("fails on 5xx status", async () => {
    const inst = mockInstance(() => new Response("oops", { status: 502 }));
    const result = await smokeStrategy.run(ctx(inst), { urls: [{ path: "/" }] });
    expect(result.passed).toBe(false);
    const failures = result.data?.urls[0].failures ?? [];
    expect(failures.some((f) => f.startsWith("status_mismatch"))).toBe(true);
  });

  it("fails on white screen at 200", async () => {
    const inst = mockInstance(() => new Response("<html></html>", { status: 200 }));
    const result = await smokeStrategy.run(ctx(inst), { urls: [{ path: "/" }] });
    expect(result.passed).toBe(false);
    expect(result.data?.urls[0].failures).toContain("white_screen");
  });

  it("does not flag white screen on a non-200 (status mismatch wins)", async () => {
    const inst = mockInstance(() => new Response("<html></html>", { status: 404 }));
    const result = await smokeStrategy.run(ctx(inst), {
      urls: [{ path: "/missing", expect_status: 404 }],
    });
    expect(result.passed).toBe(true);
  });

  it("respects custom expect_status", async () => {
    const inst = mockInstance(() => new Response(okHtml, { status: 404 }));
    const result = await smokeStrategy.run(ctx(inst), {
      urls: [{ path: "/missing", expect_status: 404 }],
    });
    expect(result.passed).toBe(true);
  });

  it("does not flag warnings unless opted in", async () => {
    const warnBody =
      "<html><body><b>Warning</b>: Undefined variable $foo in /wp/x.php on line 1<br>" +
      "x".repeat(500) +
      "</body></html>";
    const inst = mockInstance(() => new Response(warnBody, { status: 200 }));
    const result = await smokeStrategy.run(ctx(inst), {
      urls: [{ path: "/", expect_status: 200 }],
    });
    expect(result.passed).toBe(true);
  });

  it("flags warnings when fail_on includes php_warning", async () => {
    const warnBody =
      "<html><body><b>Warning</b>: Undefined variable $foo in /wp/x.php on line 1<br>" +
      "x".repeat(500) +
      "</body></html>";
    const inst = mockInstance(() => new Response(warnBody, { status: 200 }));
    const result = await smokeStrategy.run(ctx(inst), {
      urls: [{ path: "/", expect_status: 200 }],
      fail_on: ["php_warning"],
    });
    expect(result.passed).toBe(false);
    expect(result.data?.urls[0].failures).toContain("php_warning");
  });

  it("captures fetch errors per-URL without aborting the whole strategy", async () => {
    const inst = mockInstance((path) => {
      if (path === "/break") throw new Error("network down");
      return new Response(okHtml, { status: 200 });
    });
    const result = await smokeStrategy.run(ctx(inst), {
      urls: [{ path: "/" }, { path: "/break" }, { path: "/again" }],
    });
    expect(result.passed).toBe(false);
    expect(result.data?.urls).toHaveLength(3);
    expect(result.data?.urls[1].failures.some((f) => f.startsWith("fetch_error"))).toBe(true);
    expect(result.data?.urls[2].passed).toBe(true);
  });
});
