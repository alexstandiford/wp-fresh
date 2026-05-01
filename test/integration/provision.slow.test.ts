import { describe, it, expect } from "vitest";
import { provision } from "../../src/core/provision.js";
import { silentLogger } from "../../src/core/logger.js";
import type { Environment } from "../../src/schemas/environment.js";

const minimalEnv: Environment = {
  id: "test-bare",
  description: "Minimal WP install for integration testing",
  blueprint: "(inline blueprint provided directly to provision)",
};

describe("provision (slow integration)", () => {
  it("provisions a WordPress instance and serves the homepage", async () => {
    await using inst = await provision(minimalEnv, {
      blueprint: { steps: [] },
      logger: silentLogger,
    });

    expect(inst.url).toMatch(/^http:\/\//);
    expect(inst.instanceId).toMatch(/^[0-9a-f-]{36}$/);

    const res = await inst.fetch("/");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.toLowerCase()).toContain("wordpress");
  });

  it("authenticated fetch reaches /wp-admin/", async () => {
    await using inst = await provision(minimalEnv, {
      blueprint: { steps: [] },
      logger: silentLogger,
    });

    const res = await inst.fetch("/wp-admin/", { auth: true });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.toLowerCase()).toMatch(/dashboard|wp-admin|profile\.php/);
  });
});
