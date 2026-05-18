import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const errorParam = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";
  const safeNext = next.startsWith("/") ? next : "/dashboard";

  if (errorParam) {
    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set("error", errorDescription ?? errorParam);
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createSupabaseServerClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (error) {
      const loginUrl = new URL("/login", requestUrl.origin);
      loginUrl.searchParams.set("error", error.message);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.redirect(new URL(safeNext, requestUrl.origin));
  }

  if (!code) {
    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set(
      "error",
      "Missing auth code. Open the email link in the same browser you used to request it."
    );
    return NextResponse.redirect(loginUrl);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set(
      "error",
      /code verifier/i.test(error.message)
        ? "This sign-in link is no longer valid in this browser. Please request a fresh magic link and open it in the same browser."
        : error.message
    );
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(new URL(safeNext, requestUrl.origin));
}
