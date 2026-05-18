import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { safeNext } from "@/lib/auth/implicit-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";
  const errorParam = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const safeRedirectPath = safeNext(next);

  if (errorParam) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", errorDescription ?? errorParam);
    return NextResponse.redirect(loginUrl);
  }

  if (token_hash && type) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (error) {
      const loginUrl = new URL("/login", origin);
      loginUrl.searchParams.set("error", error.message);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.redirect(new URL(safeRedirectPath, origin));
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
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

    return NextResponse.redirect(new URL(safeRedirectPath, origin));
  }

  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("authRecovery", "1");
  loginUrl.searchParams.set("next", safeRedirectPath);
  return NextResponse.redirect(loginUrl);
}
