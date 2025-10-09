import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { SwapCard } from "../SwapCard";

describe("SwapCard", () => {
  const mockQuote = {
    amountOut: "980000",
    priceImpactBps: 12,
    routers: [
      { id: "titan", name: "Titan Direct" },
      { id: "jup", name: "Jupiter" },
    ],
    executable: true,
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockQuote,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the default swap inputs", async () => {
    render(<SwapCard />);

    expect(
      screen.getByRole("heading", { name: /frog trading exchange/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/from/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/to/i)).toBeInTheDocument();
    expect(await screen.findByText(/quote preview/i)).toBeInTheDocument();
    expect(await screen.findByText(/Titan Direct/i)).toBeInTheDocument();
  });
});
