import { beforeEach, describe, expect, it, vi } from "vitest";

import { signOutEverywhere } from "./sign-out";

const signOut = vi.fn();
vi.mock("./supabase", () => ({ getSupabase: () => ({ auth: { signOut } }) }));
const disableWebPush = vi.fn(() => Promise.resolve());
vi.mock("./web-push", () => ({ disableWebPush: () => disableWebPush() }));

describe("signOutEverywhere", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem("studypulse.focus-run", "{}");
    window.localStorage.setItem("other-site-key", "keep");
    window.sessionStorage.setItem("x", "1");
  });

  it("revokes every session, then clears this browser's app storage", async () => {
    signOut.mockResolvedValue({ error: null });
    await signOutEverywhere({} as never);
    expect(disableWebPush).toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(window.localStorage.getItem("studypulse.focus-run")).toBeNull();
    expect(window.localStorage.getItem("other-site-key")).toBe("keep");
    expect(window.sessionStorage.length).toBe(0);
  });

  it("still signs out locally when the global call fails (offline)", async () => {
    signOut
      .mockResolvedValueOnce({ error: new Error("offline") })
      .mockResolvedValue({ error: null });
    await signOutEverywhere({} as never);
    expect(signOut).toHaveBeenLastCalledWith({ scope: "local" });
    expect(window.localStorage.getItem("studypulse.focus-run")).toBeNull();
  });
});
