// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { LoginForm } from "./LoginForm";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: vi.fn()
}));

const createSupabaseBrowserClientMock = vi.mocked(createSupabaseBrowserClient);

describe("LoginForm auth recovery", () => {
  const setSession = vi.fn();
  const signInWithOAuth = vi.fn();

  beforeEach(() => {
    setSession.mockReset();
    signInWithOAuth.mockReset();
    createSupabaseBrowserClientMock.mockReturnValue({
      auth: {
        setSession,
        signInWithOAuth
      }
    } as never);
    window.history.pushState(null, "", "/login");
  });

  afterEach(() => {
    cleanup();
  });

  it("explains incomplete email links without looping on a missing auth code", async () => {
    window.history.pushState(null, "", "/login?authRecovery=1");

    render(<LoginForm />);

    expect(
      await screen.findByText(
        "This email link did not include a usable sign-in token. Please request a fresh magic link and open the newest email."
      )
    ).toBeTruthy();
    expect(setSession).not.toHaveBeenCalled();
  });

  it("completes sign-in when Supabase implicit tokens are preserved in the URL hash", async () => {
    setSession.mockReturnValue(new Promise(() => undefined));
    window.history.pushState(
      null,
      "",
      "/login?authRecovery=1&next=/dashboard#access_token=access-123&refresh_token=refresh-456"
    );

    render(<LoginForm />);

    await waitFor(() => {
      expect(setSession).toHaveBeenCalledWith({
        access_token: "access-123",
        refresh_token: "refresh-456"
      });
    });
    expect(screen.getByText("Completing sign-in...")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Signing in..." })).toBeTruthy();
  });

  it("shows Supabase hash errors and removes the fragment from history", async () => {
    window.history.pushState(
      null,
      "",
      "/login#access_token=&error=access_denied&error_description=Expired%20link"
    );

    render(<LoginForm />);

    expect(await screen.findByText("Expired link")).toBeTruthy();
    expect(window.location.hash).toBe("");
  });
});
