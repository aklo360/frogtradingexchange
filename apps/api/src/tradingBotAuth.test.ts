import { describe, expect, it } from "vitest";

import type { Env } from "./env";
import {
  authorizeTradingBotRequest,
  resolveTradingBotToken,
  resolveTradingBotTokens,
} from "./tradingBotAuth";

describe("trading-bot service authorization", () => {
  const env = {
    RIBBOT_TRADING_BOT_TOKEN: "legacy-primary",
    FROGX_BOT_API_TOKEN: "legacy-fallback",
    RIBBOT_CLOUDFLARE_TOKEN: "cloudflare-ribbot",
  } as Env;

  it("preserves the legacy token as the internal-call credential", () => {
    expect(resolveTradingBotToken(env)).toBe("legacy-primary");
    expect(resolveTradingBotTokens(env)).toEqual([
      "legacy-primary",
      "legacy-fallback",
      "cloudflare-ribbot",
    ]);
  });

  it.each(["legacy-primary", "legacy-fallback", "cloudflare-ribbot"])(
    "accepts configured credential %s",
    (token) => {
      const request = new Request("https://frogx.example/private", {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(authorizeTradingBotRequest(request, env)).toBe("allowed");
    },
  );

  it("fails closed for missing or unrecognized credentials", () => {
    expect(
      authorizeTradingBotRequest(
        new Request("https://frogx.example/private", {
          headers: { Authorization: "Bearer wrong" },
        }),
        env,
      ),
    ).toBe("denied");
    expect(
      authorizeTradingBotRequest(
        new Request("https://frogx.example/private"),
        {} as Env,
      ),
    ).toBe("missing");
  });
});
