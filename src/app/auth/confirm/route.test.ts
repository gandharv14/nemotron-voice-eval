import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { createSupabaseServerClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn()
}));

const createSupabaseServerClientMock = vi.mocked(createSupabaseServerClient);

describe("auth confirm route", () => {
  beforeEach(() => {
    createSupabaseServerClientMock.mockReset();
  });

  it("redirects incomplete confirmation links to auth recovery", async () => {
    const response = await GET(new Request("https://app.example/auth/confirm"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example/login?authRecovery=1&next=%2Fdashboard"
    );
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it("verifies signup token_hash links", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        verifyOtp
      }
    } as never);

    const response = await GET(
      new Request("https://app.example/auth/confirm?token_hash=token&type=signup&next=/dashboard")
    );

    expect(verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: "token" });
    expect(response.headers.get("location")).toBe("https://app.example/dashboard");
  });

  it("exchanges code links when Supabase sends PKCE confirmation URLs", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        exchangeCodeForSession
      }
    } as never);

    const response = await GET(
      new Request("https://app.example/auth/confirm?code=auth-code&next=/admin")
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("auth-code");
    expect(response.headers.get("location")).toBe("https://app.example/admin");
  });
});
