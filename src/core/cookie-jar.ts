/**
 * Minimal cookie jar for capturing admin session cookies from a WordPress login flow.
 * Not a full RFC 6265 implementation -- only handles name=value pairs from Set-Cookie.
 */
export class CookieJar {
  private store = new Map<string, string>();

  /** Ingest Set-Cookie headers from a Response. Existing names are overwritten. */
  ingest(headers: Headers): void {
    const getSetCookie = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
    const setCookies = typeof getSetCookie === "function" ? getSetCookie.call(headers) : [];
    for (const sc of setCookies) {
      const [pair] = sc.split(";");
      const eq = pair.indexOf("=");
      if (eq < 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!name) continue;
      if (value === "" || value === "deleted") {
        this.store.delete(name);
      } else {
        this.store.set(name, value);
      }
    }
  }

  /** Manually set a cookie. */
  set(name: string, value: string): void {
    this.store.set(name, value);
  }

  /** Encode as a Cookie request header. */
  toHeader(): string {
    return Array.from(this.store.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  /** Export as { name, value } entries for Playwright cookie injection. */
  toEntries(): Array<{ name: string; value: string }> {
    return Array.from(this.store.entries()).map(([name, value]) => ({ name, value }));
  }

  size(): number {
    return this.store.size;
  }
}
