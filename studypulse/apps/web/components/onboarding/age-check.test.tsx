import { AGE_MESSAGES } from "@studypulse/core/auth";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";

import { AgeCheck } from "./AgeCheck";

const onboarding = { ageConfirmed: vi.fn(), confirmAge: vi.fn() };
const api = { onboarding };
vi.mock("@/components/auth/SessionProvider", () => ({ useApi: () => api }));
const signOut = vi.fn(() => Promise.resolve({ error: null }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ auth: { signOut } }) }));
const clearAppStorage = vi.fn();
vi.mock("@/lib/sign-out", () => ({ clearAppStorage: () => clearAppStorage() }));

async function answer(month: string, year: string) {
  await userEvent.selectOptions(await screen.findByLabelText("Month"), month);
  await userEvent.selectOptions(screen.getByLabelText("Year"), year);
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("AgeCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("shows onboarding straight away when the age is already confirmed", async () => {
    onboarding.ageConfirmed.mockResolvedValue(true);
    render(<AgeCheck>onboarding</AgeCheck>);
    expect(await screen.findByText("onboarding")).toBeInTheDocument();
  });

  it("asks an Apple/Google account first, then continues for an adult", async () => {
    onboarding.ageConfirmed.mockResolvedValue(false);
    onboarding.confirmAge.mockResolvedValue("confirmed");
    render(<AgeCheck>onboarding</AgeCheck>);
    expect(await screen.findByRole("heading", { name: "One question first" })).toBeInTheDocument();
    await expectNoAxeViolations();
    await answer("March", "2001");
    expect(onboarding.confirmAge).toHaveBeenCalledWith("2001-03");
    expect(await screen.findByText("onboarding")).toBeInTheDocument();
  });

  it("signs a child out after the server deletes the account", async () => {
    onboarding.ageConfirmed.mockResolvedValue(false);
    onboarding.confirmAge.mockResolvedValue("blocked");
    render(<AgeCheck>onboarding</AgeCheck>);
    await answer("January", String(new Date().getFullYear() - 9));
    expect(await screen.findByText(new RegExp(AGE_MESSAGES.blocked))).toBeInTheDocument();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(clearAppStorage).toHaveBeenCalled();
    expect(screen.queryByText("onboarding")).not.toBeInTheDocument();
  });
});
