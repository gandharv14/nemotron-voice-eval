import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";
  const errorParam = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const safeNext = next.startsWith("/") ? next : "/dashboard";

  if (errorParam) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", errorDescription ?? errorParam);
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createSupabaseServerClient();

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (error) {
      const loginUrl = new URL("/login", origin);
      loginUrl.searchParams.set("error", error.message);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.redirect(new URL(safeNext, origin));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      const loginUrl = new URL("/login", origin);
      loginUrl.searchParams.set(
        "error",
        /code verifier/i.test(error.message)
          ? "This sign-in link is no longer valid in this browser. Please request a fresh magic link and open it in the same browser."
          : error.message
      );
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.redirect(new URL(safeNext, origin));
  }

  if (!token_hash || !type) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set(
      "error",
      "Missing or invalid confirmation link. Request a new magic link and try again."
    );
    return NextResponse.redirect(loginUrl);
  }
}
