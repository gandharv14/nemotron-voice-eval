"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { parseImplicitSessionHash, safeNext } from "@/lib/auth/implicit-session";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type MagicLinkResponse = {
  message?: string;
  error?: string;
  retryAfterSeconds?: number;
  retryAt?: string;
};

export function LoginForm({ error }: { error?: string } = {}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(error ?? null);
  const [loading, setLoading] = useState(false);
  const [recoveringSession, setRecoveringSession] = useState(false);
  const [cooldown, setCooldown] = useState<{ email: string; until: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const googleAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";
  const normalizedEmail = email.trim().toLowerCase();
  const cooldownApplies = cooldown?.email === normalizedEmail;
  const cooldownRemaining = cooldownApplies
    ? Math.max(0, Math.ceil((cooldown.until - now) / 1000))
    : 0;
  const submitLabel = recoveringSession
    ? "Signing in..."
    : loading
      ? "Sending..."
      : cooldownRemaining > 0
        ? `Resend in ${formatCooldown(cooldownRemaining)}`
        : "Send magic link";

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const fallbackNext = safeNext(query.get("next"));
    const parsedSession = parseImplicitSessionHash(window.location.hash, fallbackNext);

    if (parsedSession.type === "empty") {
      if (query.get("authRecovery") === "1" && !error) {
        setMessage(
          "This email link did not include a usable sign-in token. Please request a fresh magic link and open the newest email."
        );
      }
      return;
    }

    if (parsedSession.type === "error") {
      setMessage(parsedSession.message);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return;
    }

    setRecoveringSession(true);
    setMessage("Completing sign-in...");

    void supabase.auth
      .setSession({
        access_token: parsedSession.accessToken,
        refresh_token: parsedSession.refreshToken
      })
      .then(({ error }) => {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);

        if (error) {
          setRecoveringSession(false);
          setMessage(error.message);
          return;
        }

        window.location.assign(parsedSession.next);
      });
  }, [error, supabase]);

  useEffect(() => {
    if (!cooldown) {
      return;
    }

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [cooldown]);

  useEffect(() => {
    if (cooldown && cooldown.until <= now) {
      setCooldown(null);
    }
  }, [cooldown, now]);

  async function signInWithMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (cooldownRemaining > 0) {
      setMessage(
        `Please wait ${formatCooldown(cooldownRemaining)} before requesting another magic link.`
      );
      return;
    }

    setEmail(normalizedEmail);
    setLoading(true);
    setMessage(null);

    const response = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ email: normalizedEmail })
    });
    const payload = await response.json().catch(() => ({})) as MagicLinkResponse;

    setLoading(false);

    if (payload.retryAfterSeconds || payload.retryAt) {
      startCooldown(normalizedEmail, payload.retryAfterSeconds ?? 0, payload.retryAt);
    }

    if (response.ok) {
      setMessage(
        payload.message ??
          "Magic link sent. Check your inbox and spam folder before requesting another link."
      );
      return;
    }

    setMessage(payload.error ?? "Could not send a magic link. Please try again shortly.");
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
        <button
          className="button"
          disabled={recoveringSession || loading || cooldownRemaining > 0}
          type="submit"
        >
          {submitLabel}
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

  function startCooldown(email: string, seconds: number, retryAt?: string) {
    const retryAtTime = retryAt ? Date.parse(retryAt) : NaN;
    const until = Number.isFinite(retryAtTime) ? retryAtTime : Date.now() + seconds * 1000;

    setNow(Date.now());
    setCooldown({ email, until });
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
