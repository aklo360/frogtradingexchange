import { describe, expect, it } from "vitest";

import { middleware } from "./middleware";

describe("security middleware", () => {
  it("allows the Privy Telegram authentication script", () => {
    const response = middleware();
    const csp = response.headers.get("Content-Security-Policy");

    expect(csp).toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://telegram.org https://auth.privy.io",
    );
  });
});
