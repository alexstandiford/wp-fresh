import { describe, it, expect } from "vitest";
import { deriveSnapshotKey } from "../../src/core/snapshot-store.js";

describe("deriveSnapshotKey", () => {
  it("is deterministic", () => {
    const input = { blueprint: { steps: [] }, wpVersion: "latest", phpVersion: "8.3" };
    expect(deriveSnapshotKey(input)).toBe(deriveSnapshotKey(input));
  });

  it("is invariant to blueprint key order", () => {
    const a = deriveSnapshotKey({
      blueprint: { a: 1, b: 2, nested: { x: 1, y: 2 } },
      wpVersion: "latest",
      phpVersion: "8.3",
    });
    const b = deriveSnapshotKey({
      blueprint: { nested: { y: 2, x: 1 }, b: 2, a: 1 },
      wpVersion: "latest",
      phpVersion: "8.3",
    });
    expect(a).toBe(b);
  });

  it("changes when blueprint content changes", () => {
    const a = deriveSnapshotKey({
      blueprint: { steps: [{ step: "login" }] },
      wpVersion: "latest",
      phpVersion: "8.3",
    });
    const b = deriveSnapshotKey({
      blueprint: { steps: [{ step: "installPlugin" }] },
      wpVersion: "latest",
      phpVersion: "8.3",
    });
    expect(a).not.toBe(b);
  });

  it("respects array order in blueprint steps", () => {
    const a = deriveSnapshotKey({
      blueprint: { steps: [{ step: "a" }, { step: "b" }] },
      wpVersion: "latest",
      phpVersion: "8.3",
    });
    const b = deriveSnapshotKey({
      blueprint: { steps: [{ step: "b" }, { step: "a" }] },
      wpVersion: "latest",
      phpVersion: "8.3",
    });
    expect(a).not.toBe(b);
  });

  it("changes when wpVersion changes", () => {
    const a = deriveSnapshotKey({ blueprint: {}, wpVersion: "latest", phpVersion: "8.3" });
    const b = deriveSnapshotKey({ blueprint: {}, wpVersion: "6.4", phpVersion: "8.3" });
    expect(a).not.toBe(b);
  });

  it("changes when phpVersion changes", () => {
    const a = deriveSnapshotKey({ blueprint: {}, wpVersion: "latest", phpVersion: "8.3" });
    const b = deriveSnapshotKey({ blueprint: {}, wpVersion: "latest", phpVersion: "8.2" });
    expect(a).not.toBe(b);
  });

  it("returns 32-char hex (truncated sha256)", () => {
    const k = deriveSnapshotKey({ blueprint: {}, wpVersion: "latest", phpVersion: "8.3" });
    expect(k).toMatch(/^[0-9a-f]{32}$/);
  });
});
