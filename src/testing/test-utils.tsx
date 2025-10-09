import { render } from "@testing-library/react";
import type { ReactElement } from "react";

export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";

export const renderWithProviders = (ui: ReactElement) => render(ui);
