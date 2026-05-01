import { describe, it, expect } from "vitest";
import { matchesTagSelector } from "../../src/core/tag-selector.js";

const env = (...t: string[]) => t;

describe("matchesTagSelector", () => {
  describe("all", () => {
    it("requires every listed tag", () => {
      expect(matchesTagSelector(env("a", "b"), { all: ["a", "b"] })).toBe(true);
      expect(matchesTagSelector(env("a"), { all: ["a", "b"] })).toBe(false);
      expect(matchesTagSelector(env("a", "b", "c"), { all: ["a", "b"] })).toBe(true);
    });
  });

  describe("any", () => {
    it("requires at least one listed tag", () => {
      expect(matchesTagSelector(env("a"), { any: ["a", "b"] })).toBe(true);
      expect(matchesTagSelector(env("b"), { any: ["a", "b"] })).toBe(true);
      expect(matchesTagSelector(env("c"), { any: ["a", "b"] })).toBe(false);
    });
  });

  describe("none", () => {
    it("rejects environments containing any listed tag", () => {
      expect(matchesTagSelector(env("a"), { all: ["a"], none: ["x"] })).toBe(true);
      expect(matchesTagSelector(env("a", "x"), { all: ["a"], none: ["x"] })).toBe(false);
    });
  });

  describe("combined all+any+none", () => {
    it("ANDs all three", () => {
      expect(
        matchesTagSelector(env("siren", "integration", "woocommerce"), {
          all: ["siren"],
          any: ["woocommerce", "edd"],
          none: ["deprecated"],
        }),
      ).toBe(true);

      expect(
        matchesTagSelector(env("siren", "integration", "woocommerce", "deprecated"), {
          all: ["siren"],
          any: ["woocommerce"],
          none: ["deprecated"],
        }),
      ).toBe(false);

      expect(
        matchesTagSelector(env("siren", "integration"), {
          all: ["siren"],
          any: ["woocommerce", "edd"],
          none: ["deprecated"],
        }),
      ).toBe(false);
    });
  });

  it("empty selector matches nothing (defensive guard)", () => {
    expect(matchesTagSelector(env("a"), {})).toBe(false);
    expect(matchesTagSelector(env(), {})).toBe(false);
  });

  it("only `none` matches anything not in the list", () => {
    expect(matchesTagSelector(env("a"), { none: ["x"] })).toBe(true);
    expect(matchesTagSelector(env("x"), { none: ["x"] })).toBe(false);
  });
});
