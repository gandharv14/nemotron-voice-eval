"use client";

import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm({ error }: { error?: string } = {}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(error ?? null);
  const [loading, setLoading] = useState(false);
  const supabase = createSupabaseBrowserClient();
  const googleAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";

  async function signInWithMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });

    setLoading(false);

    if (!error) {
      setMessage("Check your email for a magic link.");
      return;
    }

    if (error.status === 429 || /rate limit/i.test(error.message)) {
      setMessage(
        "Too many magic-link requests. Wait a few minutes and try again, or use a different email address."
      );
      return;
    }

    setMessage(error.message);
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });
  }

  return (
    <div className="card stack">
      <h1>Sign in</h1>
      <form className="stack" onSubmit={signInWithMagicLink}>
        <label className="field">
          <span>Email</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <button className="button" disabled={loading} type="submit">
          {loading ? "Sending..." : "Send magic link"}
        </button>
      </form>
      {googleAuthEnabled ? (
        <button className="button secondary" type="button" onClick={signInWithGoogle}>
          Continue with Google
        </button>
      ) : null}
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
