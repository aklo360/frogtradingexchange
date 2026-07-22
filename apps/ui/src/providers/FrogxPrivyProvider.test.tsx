import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FrogxPrivyProvider, isPrivyConfigured } from "./FrogxPrivyProvider";

const originalPrivyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

describe("FrogxPrivyProvider", () => {
  afterEach(() => {
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = originalPrivyAppId;
  });

  it("renders a clear setup error when the public Privy app ID is missing", () => {
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = "";

    render(
      <FrogxPrivyProvider>
        <div>child app</div>
      </FrogxPrivyProvider>,
    );

    expect(isPrivyConfigured()).toBe(false);
    expect(
      screen.getByRole("heading", { name: /account mode is not configured/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("child app")).not.toBeInTheDocument();
  });
});
