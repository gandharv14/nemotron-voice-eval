import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { createSupabaseServerClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn()
}));

const createSupabaseServerClientMock = vi.mocked(createSupabaseServerClient);

describe("auth callback route", () => {
  beforeEach(() => {
    createSupabaseServerClientMock.mockReset();
  });

  it("redirects malformed callbacks to hash recovery instead of showing a missing-code error", async () => {
    const response = await GET(new Request("https://app.example/auth/callback"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example/login?authRecovery=1&next=%2Fdashboard"
    );
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it("exchanges PKCE auth codes and redirects to a safe next path", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        exchangeCodeForSession
      }
    } as never);

    const response = await GET(
      new Request("https://app.example/auth/callback?code=auth-code&next=/admin")
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("auth-code");
    expect(response.headers.get("location")).toBe("https://app.example/admin");
  });

  it("verifies token_hash links that are safe across browsers", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        verifyOtp
      }
    } as never);

    const response = await GET(
      new Request("https://app.example/auth/callback?token_hash=token&type=magiclink")
    );

    expect(verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: "token" });
    expect(response.headers.get("location")).toBe("https://app.example/dashboard");
  });

  it("does not allow open redirects through next", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        exchangeCodeForSession
      }
    } as never);

    const response = await GET(
      new Request("https://app.example/auth/callback?code=auth-code&next=https://evil.example")
    );

    expect(response.headers.get("location")).toBe("https://app.example/dashboard");
  });
});
