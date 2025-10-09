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

  it("renders the swap layout with quote data", async () => {
    render(<SwapCard />);

    expect(
      screen.getByRole("heading", { name: /frog trading exchange/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/you pay/i)).toBeInTheDocument();
    expect(screen.getByText(/you receive/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /switch tokens/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/select token to pay/i)).toBeInTheDocument();

    expect(await screen.findByText(/quote preview/i)).toBeInTheDocument();
    expect(await screen.findByText(/titan direct/i)).toBeInTheDocument();
  });
});
