import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBestQuote, type QuoteRequest } from "./titan";

type WebSocketListener = (event: Event) => void;

class ClosingWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;

  readyState = ClosingWebSocket.CONNECTING;
  private listeners = new Map<string, Set<WebSocketListener>>();

  constructor() {
    queueMicrotask(() => this.emit("close", new Event("close")));
  }

  addEventListener(type: string, listener: WebSocketListener) {
    const listeners = this.listeners.get(type) ?? new Set<WebSocketListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: WebSocketListener) {
    this.listeners.get(type)?.delete(listener);
  }

  send() {
    // no-op
  }

  close() {
    this.readyState = 3;
  }

  private emit(type: string, event: Event) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const quotePayload: QuoteRequest = {
  inMint: "So11111111111111111111111111111111111111112",
  outMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  amountIn: "1000000000",
  slippageBps: 50,
  priorityFee: 0,
  userPublicKey: "HhyrHD991iGyro74G2MSv9VicoH1VZE8hjrNyaoYeCYf",
};

describe("fetchBestQuote", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("redacts Titan auth tokens from aggregate quote errors", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.stubGlobal("WebSocket", ClosingWebSocket);

    await expect(
      fetchBestQuote(quotePayload, {
        token: "secret-titan-token",
        httpBaseUrl: "https://api.test/api/v1",
        wsUrl: "wss://{region}.api.test/api/v1/ws",
        preferredRegions: ["us1", "de1"],
        quoteFreshnessSeconds: 10,
      }),
    ).rejects.toThrow(/auth=redacted/);

    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain("secret-titan-token");
  });
});
