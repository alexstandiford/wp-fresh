import { describe, it, expect } from "vitest";
import { parseResolution, CaptureConfig } from "../../src/strategies/capture.js";
import Ajv2020 from "ajv/dist/2020.js";

type AjvCtor = typeof import("ajv/dist/2020.js");
const AjvImpl = (Ajv2020 as unknown as AjvCtor).default ?? (Ajv2020 as unknown as AjvCtor);
const ajv = new AjvImpl({ strict: false, allErrors: true });
const validate = ajv.compile(CaptureConfig);

describe("parseResolution", () => {
  it("parses standard sizes", () => {
    expect(parseResolution("1280x800")).toEqual({ width: 1280, height: 800 });
    expect(parseResolution("1920x1080")).toEqual({ width: 1920, height: 1080 });
  });

  it("rejects malformed strings", () => {
    expect(() => parseResolution("1280")).toThrow();
    expect(() => parseResolution("1280-800")).toThrow();
    expect(() => parseResolution("widthxheight")).toThrow();
  });
});

describe("CaptureConfig schema", () => {
  it("accepts a minimal config", () => {
    expect(
      validate({
        urls: [{ path: "/wp-admin/", name: "dashboard" }],
      }),
    ).toBe(true);
  });

  it("accepts full config with overrides", () => {
    expect(
      validate({
        resolution: "1920x1080",
        format: "jpeg",
        full_page: true,
        urls: [{ path: "/", name: "home", auth: true, wait_for_selector: "#main" }],
      }),
    ).toBe(true);
  });

  it("rejects invalid resolution", () => {
    expect(
      validate({
        resolution: "1280-800",
        urls: [{ path: "/", name: "home" }],
      }),
    ).toBe(false);
  });

  it("rejects invalid name (uppercase)", () => {
    expect(
      validate({
        urls: [{ path: "/", name: "BadName" }],
      }),
    ).toBe(false);
  });

  it("requires at least one url", () => {
    expect(validate({ urls: [] })).toBe(false);
  });
});
