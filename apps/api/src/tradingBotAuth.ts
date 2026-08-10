import type { Env } from "./env";

export type TradingBotAuthorization = "allowed" | "denied" | "missing";

export function resolveTradingBotTokens(env: Env): string[] {
  return [
    env.RIBBOT_TRADING_BOT_TOKEN,
    env.FROGX_BOT_API_TOKEN,
    env.RIBBOT_CLOUDFLARE_TOKEN,
  ].reduce<string[]>((tokens, value) => {
    const token = value?.trim();
    if (token && !tokens.includes(token)) tokens.push(token);
    return tokens;
  }, []);
}

export function resolveTradingBotToken(env: Env): string | undefined {
  return resolveTradingBotTokens(env)[0];
}

export function authorizeTradingBotRequest(
  request: Request,
  env: Env,
): TradingBotAuthorization {
  const tokens = resolveTradingBotTokens(env);
  if (tokens.length === 0) return "missing";

  const authorization = request.headers.get("Authorization") ?? "";
  return tokens.some((token) => authorization === `Bearer ${token}`)
    ? "allowed"
    : "denied";
}
