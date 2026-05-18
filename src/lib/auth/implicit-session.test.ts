import { describe, expect, it } from "vitest";
import { parseImplicitSessionHash, safeNext } from "./implicit-session";

describe("parseImplicitSessionHash", () => {
  it("returns a session from implicit Supabase hash tokens", () => {
    expect(
      parseImplicitSessionHash(
        "#access_token=access-123&refresh_token=refresh-456&next=%2Fadmin",
        "/dashboard"
      )
    ).toEqual({
      type: "session",
      accessToken: "access-123",
      refreshToken: "refresh-456",
      next: "/admin"
    });
  });

  it("uses the fallback redirect when the hash does not contain next", () => {
    expect(
      parseImplicitSessionHash("#access_token=access-123&refresh_token=refresh-456", "/dashboard")
    ).toMatchObject({
      type: "session",
      next: "/dashboard"
    });
  });

  it("returns a Supabase error from the hash when present", () => {
    expect(parseImplicitSessionHash("#error=access_denied&error_description=Expired%20link")).toEqual({
      type: "error",
      message: "Expired link"
    });
  });

  it("ignores incomplete or empty hashes", () => {
    expect(parseImplicitSessionHash("")).toEqual({ type: "empty" });
    expect(parseImplicitSessionHash("#access_token=access-123")).toEqual({ type: "empty" });
  });
});

describe("safeNext", () => {
  it("allows relative app paths only", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("https://evil.example")).toBe("/dashboard");
    expect(safeNext("//evil.example")).toBe("/dashboard");
    expect(safeNext(null, "/login")).toBe("/login");
  });
});
