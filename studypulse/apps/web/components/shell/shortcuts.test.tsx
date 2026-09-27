import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Shortcuts } from "./Shortcuts";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const press = (key: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.body, { key, ...init });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("keyboard shortcuts (L5)", () => {
  it("goes to a destination with g then a letter, and starts focus with f", () => {
    render(<Shortcuts />);
    press("g");
    press("t");
    expect(push).toHaveBeenCalledWith("/today");
    press("f");
    expect(push).toHaveBeenLastCalledWith("/focus?start=1");
  });

  it("ignores keys while typing and with modifier keys", () => {
    render(
      <>
        <Shortcuts />
        <input aria-label="Title" />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText("Title"), { key: "f" });
    press("f", { ctrlKey: true });
    press("f", { metaKey: true });
    expect(push).not.toHaveBeenCalled();
  });

  it("lists the shortcuts on ? and from the navigation, and can turn them off", async () => {
    const user = userEvent.setup();
    render(<Shortcuts />);
    press("?");
    const dialog = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    expect(dialog).toHaveTextContent("g then tGo to Today");
    await user.click(screen.getByRole("checkbox", { name: "Use keyboard shortcuts" }));
    expect(window.localStorage.getItem("studypulse.shortcuts")).toBe("off");
    await user.click(screen.getByRole("button", { name: "Done" }));
    press("f");
    expect(push).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Shortcuts" }));
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
  });
});
