import { describe, it, expect } from "vitest";
import { CookieJar } from "../../src/core/cookie-jar.js";

function headersWithSetCookie(...values: string[]): Headers {
  const h = new Headers();
  for (const v of values) h.append("set-cookie", v);
  return h;
}

describe("CookieJar", () => {
  it("ingests a single Set-Cookie header", () => {
    const jar = new CookieJar();
    jar.ingest(headersWithSetCookie("foo=bar; path=/"));
    expect(jar.toHeader()).toBe("foo=bar");
  });

  it("ingests multiple Set-Cookie headers", () => {
    const jar = new CookieJar();
    jar.ingest(headersWithSetCookie("a=1; path=/", "b=2; path=/; secure"));
    const header = jar.toHeader();
    expect(header).toContain("a=1");
    expect(header).toContain("b=2");
  });

  it("overwrites existing names", () => {
    const jar = new CookieJar();
    jar.ingest(headersWithSetCookie("session=old"));
    jar.ingest(headersWithSetCookie("session=new"));
    expect(jar.toHeader()).toBe("session=new");
  });

  it("treats deleted/empty values as removal", () => {
    const jar = new CookieJar();
    jar.ingest(headersWithSetCookie("session=valid"));
    jar.ingest(headersWithSetCookie("session=deleted; expires=Thu, 01 Jan 1970 00:00:00 GMT"));
    expect(jar.size()).toBe(0);
  });

  it("exports entries for Playwright cookie injection", () => {
    const jar = new CookieJar();
    jar.set("wordpress_test_cookie", "WP+Cookie+check");
    jar.set("wordpress_logged_in_abc", "user|hash");
    const entries = jar.toEntries();
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.name === "wordpress_test_cookie")?.value).toBe("WP+Cookie+check");
  });

  it("preserves = inside cookie values", () => {
    const jar = new CookieJar();
    jar.ingest(headersWithSetCookie("token=abc=def=ghi; path=/"));
    expect(jar.toHeader()).toBe("token=abc=def=ghi");
  });
});
