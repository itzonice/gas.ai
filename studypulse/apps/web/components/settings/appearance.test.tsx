import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AppearanceSection } from "./AppearanceSection";

describe("AppearanceSection", () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("switches to dark and back to the device setting, remembering the choice", () => {
    render(<AppearanceSection />);
    expect(screen.getByRole("radio", { name: /match my device/i })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: /^dark/i }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("sp-theme")).toBe("dark");
    expect(screen.getByRole("radio", { name: /^dark/i })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: /match my device/i }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem("sp-theme")).toBeNull();
  });
});
