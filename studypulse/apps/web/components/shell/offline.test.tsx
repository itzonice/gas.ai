import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OfflineBanner } from "./OfflineBanner";

describe("offline banner (L2)", () => {
  it("says so while the browser is offline, and goes away when it's back", () => {
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    const set = (online: boolean) => {
      Object.defineProperty(navigator, "onLine", { value: online, configurable: true });
      act(() => {
        window.dispatchEvent(new Event(online ? "online" : "offline"));
      });
    };
    set(false);
    expect(screen.getByRole("status")).toHaveTextContent("You're offline.");
    set(true);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
