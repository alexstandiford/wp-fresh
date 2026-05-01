import { describe, it, expect } from "vitest";
import { runStrategyInvocation } from "../../src/core/runner.js";
import { StrategyRegistry } from "../../src/core/strategy-registry.js";
import { silentLogger } from "../../src/core/logger.js";
import type { Strategy, StrategyContext, Instance } from "../../src/strategies/types.js";
import type { StrategyResultEntry } from "../../src/schemas/manifest.js";
import { Type } from "@sinclair/typebox";

function stubStrategy(id: string, passed: boolean): Strategy {
  return {
    id,
    description: `stub ${id}`,
    configSchema: Type.Object({}),
    async run(_ctx: StrategyContext, _config: unknown) {
      return { passed };
    },
  };
}

const stubInstance: Instance = {
  instanceId: "stub",
  url: "http://stub.local",
  fetch: async () => new Response(""),
  browser: async () => {
    throw new Error("not used");
  },
};

function ctx(registry: StrategyRegistry) {
  return {
    registry,
    instance: stubInstance,
    outputDirRoot: "/tmp/wpfresh-test",
    runId: "test-run",
    envId: "test-env",
    logger: silentLogger,
  };
}

describe("runIf state machine", () => {
  it("'always' runs regardless of prior", async () => {
    const registry = new StrategyRegistry();
    registry.register(stubStrategy("a", false));
    const r = await runStrategyInvocation(
      { ref: "a", runIf: "always" },
      [
        {
          ref: "x",
          passed: false,
          started_at: "2026-01-01T00:00:00Z",
          completed_at: "2026-01-01T00:00:01Z",
        },
      ],
      ctx(registry),
    );
    expect(r.passed).toBe(false);
    expect(r.skipped).toBeFalsy();
  });

  it("'previous-passed' runs when prior passed", async () => {
    const registry = new StrategyRegistry();
    registry.register(stubStrategy("a", true));
    const r = await runStrategyInvocation({ ref: "a", runIf: "previous-passed" }, [
      { ref: "x", passed: true, started_at: "t", completed_at: "t" },
    ], ctx(registry));
    expect(r.skipped).toBeFalsy();
    expect(r.passed).toBe(true);
  });

  it("'previous-passed' skips when prior failed", async () => {
    const registry = new StrategyRegistry();
    registry.register(stubStrategy("a", true));
    const r = await runStrategyInvocation({ ref: "a", runIf: "previous-passed" }, [
      { ref: "x", passed: false, started_at: "t", completed_at: "t" },
    ], ctx(registry));
    expect(r.skipped).toBe(true);
    expect(r.skip_reason).toContain("previous-passed");
  });

  it("'previous-passed' looks back past skipped strategies", async () => {
    const registry = new StrategyRegistry();
    registry.register(stubStrategy("a", true));
    const prior: StrategyResultEntry[] = [
      { ref: "x", passed: true, started_at: "t", completed_at: "t" },
      { ref: "y", passed: false, skipped: true, started_at: "t", completed_at: "t" },
    ];
    const r = await runStrategyInvocation({ ref: "a", runIf: "previous-passed" }, prior, ctx(registry));
    expect(r.skipped).toBeFalsy();
  });

  it("'previous-failed' runs when prior failed", async () => {
    const registry = new StrategyRegistry();
    registry.register(stubStrategy("a", true));
    const r = await runStrategyInvocation({ ref: "a", runIf: "previous-failed" }, [
      { ref: "x", passed: false, started_at: "t", completed_at: "t" },
    ], ctx(registry));
    expect(r.skipped).toBeFalsy();
  });

  it("'previous-failed' skips when prior passed", async () => {
    const registry = new StrategyRegistry();
    registry.register(stubStrategy("a", true));
    const r = await runStrategyInvocation({ ref: "a", runIf: "previous-failed" }, [
      { ref: "x", passed: true, started_at: "t", completed_at: "t" },
    ], ctx(registry));
    expect(r.skipped).toBe(true);
  });

  it("'all-passed' requires every non-skipped prior to have passed", async () => {
    const registry = new StrategyRegistry();
    registry.register(stubStrategy("a", true));
    const allOk: StrategyResultEntry[] = [
      { ref: "x", passed: true, started_at: "t", completed_at: "t" },
      { ref: "y", passed: true, started_at: "t", completed_at: "t" },
    ];
    expect((await runStrategyInvocation({ ref: "a", runIf: "all-passed" }, allOk, ctx(registry))).skipped).toBeFalsy();

    const oneFailed: StrategyResultEntry[] = [
      { ref: "x", passed: true, started_at: "t", completed_at: "t" },
      { ref: "y", passed: false, started_at: "t", completed_at: "t" },
    ];
    expect((await runStrategyInvocation({ ref: "a", runIf: "all-passed" }, oneFailed, ctx(registry))).skipped).toBe(true);

    const skippedDoesntCount: StrategyResultEntry[] = [
      { ref: "x", passed: true, started_at: "t", completed_at: "t" },
      { ref: "y", passed: false, skipped: true, started_at: "t", completed_at: "t" },
    ];
    expect((await runStrategyInvocation({ ref: "a", runIf: "all-passed" }, skippedDoesntCount, ctx(registry))).skipped).toBeFalsy();
  });

  it("'previous-failed' skips when there is no prior", async () => {
    const registry = new StrategyRegistry();
    registry.register(stubStrategy("a", true));
    const r = await runStrategyInvocation({ ref: "a", runIf: "previous-failed" }, [], ctx(registry));
    expect(r.skipped).toBe(true);
  });

  it("'previous-passed' runs when there is no prior", async () => {
    const registry = new StrategyRegistry();
    registry.register(stubStrategy("a", true));
    const r = await runStrategyInvocation({ ref: "a", runIf: "previous-passed" }, [], ctx(registry));
    expect(r.skipped).toBeFalsy();
  });

  it("unknown strategy ref produces a failure entry", async () => {
    const registry = new StrategyRegistry();
    const r = await runStrategyInvocation({ ref: "nonexistent" }, [], ctx(registry));
    expect(r.passed).toBe(false);
    expect((r.data as { error?: string } | undefined)?.error).toContain("unknown strategy");
  });
});
