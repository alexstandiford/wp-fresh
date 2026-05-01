import { describe, it, expect } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { Environment } from "../../src/schemas/environment.js";
import { Run } from "../../src/schemas/run.js";
import { Manifest } from "../../src/schemas/manifest.js";
import { CompositeStrategy, StrategyInvocation } from "../../src/schemas/strategy.js";

const ajv = new Ajv2020.default({ strict: false, allErrors: true });
addFormats.default(ajv);

const validators = {
  environment: ajv.compile(Environment),
  run: ajv.compile(Run),
  manifest: ajv.compile(Manifest),
  composite: ajv.compile(CompositeStrategy),
  invocation: ajv.compile(StrategyInvocation),
};

describe("Environment schema", () => {
  it("accepts a minimal valid environment", () => {
    const valid = {
      id: "siren-bare",
      description: "Bare Siren install on vanilla WordPress",
      tags: ["siren"],
      blueprint: "../blueprints/siren.blueprint.json",
      wp_version: "latest",
      php_version: "8.3",
    };
    expect(validators.environment(valid)).toBe(true);
  });

  it("rejects bad id pattern", () => {
    expect(
      validators.environment({
        id: "Bad-ID",
        description: "long enough description",
        blueprint: "./b.json",
      }),
    ).toBe(false);
  });

  it("rejects short description", () => {
    expect(
      validators.environment({
        id: "ok-id",
        description: "short",
        blueprint: "./b.json",
      }),
    ).toBe(false);
  });

  it("rejects extra properties", () => {
    expect(
      validators.environment({
        id: "ok-id",
        description: "long enough description here",
        blueprint: "./b.json",
        weird: 1,
      }),
    ).toBe(false);
  });

  it("accepts with auth override", () => {
    expect(
      validators.environment({
        id: "ok-id",
        description: "long enough description",
        blueprint: "./b.json",
        auth: { admin_user: "root", admin_password: "secret" },
      }),
    ).toBe(true);
  });
});

describe("Run schema", () => {
  it("accepts a run with ids", () => {
    expect(
      validators.run({
        environments: { ids: ["siren-bare"] },
        strategies: [{ ref: "smoke", config: { urls: [] } }],
      }),
    ).toBe(true);
  });

  it("accepts a run with tag selectors", () => {
    expect(
      validators.run({
        environments: { tags: { all: ["siren"], none: ["deprecated"] } },
        strategies: [{ ref: "smoke" }],
      }),
    ).toBe(true);
  });

  it("requires either ids or tags", () => {
    expect(
      validators.run({
        environments: {},
        strategies: [{ ref: "smoke" }],
      }),
    ).toBe(false);
  });

  it("rejects empty strategies", () => {
    expect(
      validators.run({
        environments: { ids: ["x"] },
        strategies: [],
      }),
    ).toBe(false);
  });
});

describe("StrategyInvocation schema", () => {
  it("accepts every runIf value", () => {
    for (const runIf of ["always", "previous-passed", "previous-failed", "all-passed"]) {
      expect(validators.invocation({ ref: "smoke", runIf })).toBe(true);
    }
  });

  it("rejects unknown runIf", () => {
    expect(validators.invocation({ ref: "smoke", runIf: "sometimes" })).toBe(false);
  });
});

describe("CompositeStrategy schema", () => {
  it("accepts a valid composite", () => {
    expect(
      validators.composite({
        id: "smoke-then-capture",
        kind: "composite",
        description: "Run smoke, then capture if smoke passes",
        strategies: [{ ref: "smoke" }, { ref: "capture", runIf: "previous-passed" }],
      }),
    ).toBe(true);
  });

  it("rejects wrong kind", () => {
    expect(
      validators.composite({
        id: "bad",
        kind: "primitive",
        description: "long enough description",
        strategies: [{ ref: "smoke" }],
      }),
    ).toBe(false);
  });
});

describe("Manifest schema", () => {
  it("accepts a minimal manifest", () => {
    expect(
      validators.manifest({
        run_id: "00000000-0000-4000-8000-000000000000",
        started_at: "2026-05-01T00:00:00Z",
        completed_at: "2026-05-01T00:00:30Z",
        run_config: {},
        results: [],
        summary: { total_environments: 0, passed_environments: 0, failed_environments: 0 },
      }),
    ).toBe(true);
  });

  it("accepts a manifest with strategy results", () => {
    expect(
      validators.manifest({
        run_id: "00000000-0000-4000-8000-000000000000",
        started_at: "2026-05-01T00:00:00Z",
        completed_at: "2026-05-01T00:00:30Z",
        run_config: {},
        results: [
          {
            environment_id: "siren-bare",
            passed: true,
            strategies: [
              {
                ref: "smoke",
                passed: true,
                started_at: "2026-05-01T00:00:00Z",
                completed_at: "2026-05-01T00:00:10Z",
              },
            ],
          },
        ],
        summary: { total_environments: 1, passed_environments: 1, failed_environments: 0 },
      }),
    ).toBe(true);
  });

  it("rejects bad uuid", () => {
    expect(
      validators.manifest({
        run_id: "not-a-uuid",
        started_at: "2026-05-01T00:00:00Z",
        completed_at: "2026-05-01T00:00:30Z",
        run_config: {},
        results: [],
        summary: { total_environments: 0, passed_environments: 0, failed_environments: 0 },
      }),
    ).toBe(false);
  });
});
