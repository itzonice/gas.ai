import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";
import { UpgradeScreen } from "@/components/upgrade/UpgradeScreen";

import { deviceSummary, planSummary, prefChanges, profileChanges } from "./model";
import { SettingsScreen } from "./SettingsScreen";
import { expectNoAxeViolations } from "@/test/axe";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth: { signOut: vi.fn(() => Promise.resolve({ error: null })) } }),
}));
const signOutEverywhere = vi.fn(() => Promise.resolve());
vi.mock("@/lib/sign-out", () => ({
  signOutEverywhere: (...args: unknown[]) => signOutEverywhere(...(args as [])),
  clearAppStorage: vi.fn(),
}));
vi.mock("@/lib/web-push", () => ({
  webPushSupported: () => false,
  enableWebPush: vi.fn(),
  disableWebPush: vi.fn(),
}));

const api = {
  settings: { get: vi.fn(), updateProfile: vi.fn(), updateNotifications: vi.fn() },
  onboarding: { complete: vi.fn() },
  billing: { status: vi.fn(), startCheckout: vi.fn(), openPortal: vi.fn() },
  account: { exportData: vi.fn(), delete: vi.fn() },
  features: vi.fn(),
};
vi.mock("@/components/auth/SessionProvider", () => ({
  useApi: () => api,
  useSession: () => ({ status: "signed-in", session: { user: { id: "u1" } } }),
}));

const profile = {
  display_name: "Ada",
  school: null,
  timezone: "America/Chicago",
  daily_study_minutes: 120,
  study_start_time: "16:00",
  card_tasks_enabled: true,
  plan_tier: "free" as const,
  onboarded_at: "2027-01-01T00:00:00Z",
};
const notifications = {
  push_enabled: true,
  email_digest_enabled: false,
  remind_24h: true,
  remind_2h: true,
  exam_countdown: true,
  morning_digest: true,
  morning_digest_time: "07:30",
  quiet_hours_enabled: true,
  quiet_hours_start: "22:00",
  quiet_hours_end: "07:00",
  daily_cap: 6,
};
const freeBilling = { pro: false, subscription: null, manage_in: null, payment_issue: false };
const noFeatures = {
  ai: false,
  stripe: false,
  revenuecat: false,
  email: false,
  webPush: false,
  googleCalendar: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  api.settings.get.mockResolvedValue({
    email: "ada@example.com",
    profile,
    notifications,
    devices: { mobile: 1, web: 0 },
  });
  api.billing.status.mockResolvedValue(freeBilling);
  api.features.mockResolvedValue(noFeatures);
  api.settings.updateProfile.mockResolvedValue(undefined);
  api.settings.updateNotifications.mockResolvedValue(undefined);
});

describe("settings model", () => {
  it("sends only what changed", () => {
    expect(profileChanges(profile, { ...profile })).toEqual({});
    expect(
      profileChanges(profile, { ...profile, display_name: "  ", daily_study_minutes: 90 }),
    ).toEqual({ displayName: null, dailyStudyMinutes: 90 });
    expect(prefChanges(notifications, { ...notifications, remind_2h: false })).toEqual({
      remind_2h: false,
    });
  });

  it("describes devices and plans in words", () => {
    expect(deviceSummary({ mobile: 1, web: 2 })).toBe("Reminders go to 1 phone and 2 browsers.");
    expect(deviceSummary({ mobile: 0, web: 0 })).toMatch(/^No devices/);
    expect(planSummary(freeBilling, "free").action).toBe("upgrade");
    const store = planSummary(
      {
        pro: true,
        manage_in: "app_store",
        payment_issue: false,
        subscription: {
          provider: "revenuecat",
          store: "app_store",
          status: "active",
          product_id: "pro",
          current_period_end: "2027-04-01T12:00:00Z",
          cancel_at_period_end: false,
          grace_period_ends_at: null,
          grants_pro: true,
        },
      },
      "pro",
    );
    expect(store).toEqual({
      title: "StudyPulse Pro",
      detail: "Renews on April 1, 2027. Manage it in the App Store.",
      action: null,
    });
  });
});

describe("SettingsScreen", () => {
  // axe checks every element, including ~400 timezone options, so it gets its own time.
  it("has no axe violations", { timeout: 20_000 }, async () => {
    render(<SettingsScreen />);
    await screen.findByRole("checkbox", { name: "Send reminders" });
    await expectNoAxeViolations();
  });

  it("saves changed fields and announces it", async () => {
    render(<SettingsScreen />);
    const twoHours = await screen.findByRole("checkbox", {
      name: "Two hours before something is due",
    });
    await userEvent.click(twoHours);
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Ada L.");
    await userEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]!);
    await waitFor(() =>
      expect(api.settings.updateNotifications).toHaveBeenCalledWith({ remind_2h: false }),
    );
    expect(api.settings.updateProfile).toHaveBeenCalledWith({ displayName: "Ada L." });
    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
  });

  it("shows unconfigured features as unavailable", async () => {
    render(<SettingsScreen />);
    const email = await screen.findByRole("checkbox", { name: /Email me a daily summary/ });
    expect(email).toBeDisabled();
    expect(email).toHaveAccessibleDescription("Email isn't available right now.");
    expect(screen.getByText("Reminders go to 1 phone.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See Pro" })).toHaveAttribute("href", "/upgrade");
  });

  it("disables reminder options while reminders are off", async () => {
    render(<SettingsScreen />);
    await userEvent.click(await screen.findByRole("checkbox", { name: "Send reminders" }));
    expect(screen.getByRole("checkbox", { name: "Exam countdown" })).toBeDisabled();
  });

  it("deletes the account only after typing DELETE", async () => {
    api.account.delete.mockResolvedValue({ deleted: true });
    render(<SettingsScreen />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete account" }));
    const dialog = await screen.findByRole("dialog", { hidden: true });
    const confirm = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent === "Delete account",
    )!;
    await userEvent.click(confirm);
    expect(api.account.delete).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent("Type DELETE in capital letters to confirm.");
    await userEvent.type(dialog.querySelector("input")!, "DELETE");
    await userEvent.click(confirm);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in?deleted=1"));
  });
});

describe("OnboardingScreen", () => {
  it("walks through three steps and saves the answers", async () => {
    api.onboarding.complete.mockResolvedValue(undefined);
    render(<OnboardingScreen />);
    expect(screen.getByRole("heading", { level: 1, name: "Welcome to StudyPulse" })).toBeVisible();
    await userEvent.type(screen.getByLabelText("What should we call you?"), "Ada");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Step 2 of 3: Study time" })).toHaveFocus();
    await userEvent.selectOptions(
      screen.getByLabelText("How long can you study on a typical day?"),
      "1 h 30 min",
    );
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Step 3 of 3: Reminders" })).toHaveFocus();
    expect(
      await screen.findByText(/Reminders in this browser aren.t available here/),
    ).toBeInTheDocument();
    await expectNoAxeViolations();
    await userEvent.click(screen.getByRole("button", { name: "Add your first syllabus" }));
    await waitFor(() =>
      expect(api.onboarding.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: "Ada",
          dailyStudyMinutes: 90,
          studyStartTime: "16:00",
        }),
      ),
    );
    expect(replace).toHaveBeenCalledWith("/courses/upload");
  });
});

describe("UpgradeScreen", () => {
  it("compares plans and opens checkout", async () => {
    api.features.mockResolvedValue({ ...noFeatures, stripe: true });
    api.billing.startCheckout.mockResolvedValue("https://checkout.stripe.test/s");
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { assign }, configurable: true });
    render(<UpgradeScreen />);
    const table = await screen.findByRole("table", { name: "Free and Pro compared" });
    await expectNoAxeViolations();
    expect(table).toHaveTextContent("Active courses3Unlimited");
    await userEvent.click(await screen.findByRole("radio", { name: /Monthly/ }));
    await userEvent.type(screen.getByLabelText("Promo code"), "SPRING");
    await userEvent.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
    await waitFor(() =>
      expect(api.billing.startCheckout).toHaveBeenCalledWith("monthly", { promoCode: "SPRING" }),
    );
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.test/s");
  });

  it("says upgrades are unavailable when billing is off", async () => {
    render(<UpgradeScreen />);
    expect(await screen.findByText(/Upgrades aren.t available right now/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upgrade to Pro" })).not.toBeInTheDocument();
  });

  it("explains checkout errors", async () => {
    api.features.mockResolvedValue({ ...noFeatures, stripe: true });
    const { ApiError } = await import("@studypulse/core/api");
    api.billing.startCheckout.mockRejectedValue(new ApiError(403, "student_email_required", "no"));
    render(<UpgradeScreen />);
    await userEvent.click(await screen.findByRole("checkbox", { name: "I'm a student" }));
    await userEvent.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("confirmed school email");
    expect(api.billing.startCheckout).toHaveBeenCalledWith("yearly", { student: true });
  });
});
