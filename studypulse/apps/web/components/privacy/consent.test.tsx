import { CONSENT_STORAGE_KEY } from "@studypulse/core/privacy";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";

import { ConsentManager } from "./ConsentManager";

const start = vi.fn();
const stop = vi.fn();
vi.mock("@/lib/error-reporting", () => ({
  startErrorReporting: () => start(),
  stopErrorReporting: () => stop(),
}));
const setChoices = vi.fn(() => Promise.resolve());
const api = { privacy: { setChoices } };
let session: { status: string; session?: { user: { id: string } } } = { status: "signed-out" };
vi.mock("@/components/auth/SessionProvider", () => ({
  useApi: () => api,
  useSession: () => session,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

function region(required: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json({ required }))),
  );
}

describe("ConsentManager (S23)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    session = { status: "signed-out" };
  });

  it("asks EU/UK visitors first, with Accept and Reject of equal weight, and runs nothing yet", async () => {
    region(true);
    render(<ConsentManager />);
    const reject = await screen.findByRole("button", { name: "Reject" });
    const accept = screen.getByRole("button", { name: "Accept" });
    expect(reject.className).toBe(accept.className);
    expect(start).not.toHaveBeenCalled();
    await expectNoAxeViolations();
  });

  it("Reject keeps error reports off and remembers the choice with the policy version", async () => {
    region(true);
    render(<ConsentManager />);
    await userEvent.click(await screen.findByRole("button", { name: "Reject" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Reject" })).toBeNull());
    expect(start).not.toHaveBeenCalled();
    const saved = JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY) ?? "{}");
    expect(saved).toMatchObject({ analytics: false, errorReports: false, version: "2026-09-25" });
  });

  it("Accept starts error reporting and saves the choice on the account", async () => {
    region(true);
    session = { status: "signed-in", session: { user: { id: "u1" } } };
    render(<ConsentManager />);
    await userEvent.click(await screen.findByRole("button", { name: "Accept" }));
    await waitFor(() => expect(start).toHaveBeenCalled());
    expect(setChoices).toHaveBeenCalledWith({ analytics: true, errorReports: true }, "banner");
  });

  it("signed in in the EU without choosing: the account is set to opted out", async () => {
    region(true);
    session = { status: "signed-in", session: { user: { id: "u2" } } };
    render(<ConsentManager />);
    await waitFor(() =>
      expect(setChoices).toHaveBeenCalledWith({ analytics: false, errorReports: false }, "signin"),
    );
  });

  it("elsewhere: no banner, and error reporting runs", async () => {
    region(false);
    render(<ConsentManager />);
    await waitFor(() => expect(start).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  });
});
