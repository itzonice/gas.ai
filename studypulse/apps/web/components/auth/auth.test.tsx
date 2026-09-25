import { AUTH_MESSAGES } from "@studypulse/core/auth";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";

import { SignInForm } from "./SignInForm";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}));
const auth = { signInWithPassword: vi.fn(), signUp: vi.fn() };
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth }),
  safeNext: () => "/today",
}));
vi.mock("./SessionProvider", () => ({ useSession: () => ({ status: "signed-out" }) }));

async function fill(email: string) {
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), "correct horse battery");
}

describe("SignInForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("says the same thing for a wrong password and an unknown email", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { status: 400, code: "invalid_credentials", message: "Invalid login credentials" },
    });
    render(<SignInForm />);
    await fill("nobody@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(AUTH_MESSAGES.signInFailed);
  });

  it("doesn't reveal that an email is already registered", async () => {
    auth.signUp.mockResolvedValue({
      data: { session: null },
      error: { status: 422, code: "user_already_exists", message: "User already registered" },
    });
    render(<SignInForm />);
    await userEvent.click(screen.getByRole("button", { name: "Create an account" }));
    await fill("taken@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText(AUTH_MESSAGES.signUpSent)).toBeInTheDocument();
    expect(screen.queryByText(/already registered/i)).not.toBeInTheDocument();
  });

  it("links the Terms of Use and Privacy Policy at sign-up", async () => {
    render(<SignInForm />);
    await userEvent.click(screen.getByRole("button", { name: "Create an account" }));
    expect(screen.getAllByRole("link", { name: "Terms of Use" })[0]).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(screen.getAllByRole("link", { name: "Privacy Policy" })[0]).toHaveAttribute(
      "href",
      "/privacy",
    );
    await expectNoAxeViolations();
  });
});
