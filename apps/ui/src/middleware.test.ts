import { describe, expect, it } from "vitest";

import { middleware } from "./middleware";

describe("middleware CSP", () => {
  it("allows the Privy and Telegram surfaces used by Telegram login", () => {
    const response = middleware();
    const csp = response.headers.get("Content-Security-Policy") ?? "";

    expect(csp).toContain("script-src");
    expect(csp).toContain("https://auth.privy.io");
    expect(csp).toContain("https://telegram.org");
    expect(csp).toContain("frame-src");
    expect(csp).toContain("https://oauth.telegram.org");
    expect(csp).toContain("frame-src 'self' https://auth.privy.io");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
