"use client";

import { FormEvent, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const MAGIC_LINK_COOLDOWN_SECONDS = 60;
const RATE_LIMIT_COOLDOWN_SECONDS = 5 * 60;
const MAGIC_LINK_COOLDOWN_KEY = "gpu-scheduler-magic-link-cooldown-until";

export function LoginForm({ error }: { error?: string } = {}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(error ?? null);
  const [loading, setLoading] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const supabase = createSupabaseBrowserClient();
  const googleAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";
  const cooldownRemaining = cooldownUntil
    ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000))
    : 0;

  useEffect(() => {
    const storedCooldown = window.localStorage.getItem(MAGIC_LINK_COOLDOWN_KEY);
    const parsedCooldown = storedCooldown ? Number(storedCooldown) : NaN;

    if (Number.isFinite(parsedCooldown) && parsedCooldown > Date.now()) {
      setCooldownUntil(parsedCooldown);
    }
  }, []);

  useEffect(() => {
    if (!cooldownUntil) {
      return;
    }

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [cooldownUntil]);

  useEffect(() => {
    if (cooldownUntil && cooldownUntil <= now) {
      setCooldownUntil(null);
      window.localStorage.removeItem(MAGIC_LINK_COOLDOWN_KEY);
    }
  }, [cooldownUntil, now]);

  async function signInWithMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (cooldownRemaining > 0) {
      setMessage(
        `Please wait ${formatCooldown(cooldownRemaining)} before requesting another magic link.`
      );
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    setEmail(normalizedEmail);
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        // The callback supports Supabase's default PKCE links and our custom
        // token_hash template, so hosted template drift does not break sign-in.
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });

    setLoading(false);

    if (!error) {
      startCooldown(MAGIC_LINK_COOLDOWN_SECONDS);
      setMessage(
        "Magic link sent. Check your inbox and spam folder; if it does not arrive, wait before requesting another link."
      );
      return;
    }

    if (error.status === 429 || /rate limit/i.test(error.message)) {
      startCooldown(RATE_LIMIT_COOLDOWN_SECONDS);
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
            autoComplete="email"
            required
          />
        </label>
        <button className="button" disabled={loading || cooldownRemaining > 0} type="submit">
          {loading
            ? "Sending..."
            : cooldownRemaining > 0
              ? `Resend in ${formatCooldown(cooldownRemaining)}`
              : "Send magic link"}
        </button>
      </form>
      {googleAuthEnabled ? (
        <button className="button secondary" type="button" onClick={signInWithGoogle}>
          Continue with Google
        </button>
      ) : null}
      {message ? <p className="muted" aria-live="polite">{message}</p> : null}
    </div>
  );

  function startCooldown(seconds: number) {
    const until = Date.now() + seconds * 1000;
    setNow(Date.now());
    setCooldownUntil(until);
    window.localStorage.setItem(MAGIC_LINK_COOLDOWN_KEY, String(until));
  }
}

function formatCooldown(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}
