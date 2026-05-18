import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const SUCCESS_COOLDOWN_SECONDS = 90;
const ERROR_COOLDOWN_SECONDS = 30;
const SUPABASE_RATE_LIMIT_COOLDOWN_SECONDS = 60 * 60;
const COOLDOWN_TABLE = "auth_magic_link_cooldowns";

const magicLinkSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase())
});

type MagicLinkReservation = {
  allowed: boolean;
  retry_after_seconds: number;
  retry_at: string;
};

export async function POST(request: Request) {
  const parsedBody = await parseRequest(request);

  if (!parsedBody.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const { email } = parsedBody.data;
  const emailHash = hashEmail(email);
  const admin = createSupabaseAdminClient();
  const { data: reservation, error: reservationError } = await admin
    .rpc("reserve_magic_link_request", {
      p_email_hash: emailHash,
      p_cooldown_seconds: SUCCESS_COOLDOWN_SECONDS
    })
    .single<MagicLinkReservation>();

  if (reservationError || !reservation) {
    return NextResponse.json(
      { error: "Could not prepare a magic-link request. Please try again shortly." },
      { status: 500 }
    );
  }

  if (!reservation.allowed) {
    return retryResponse(
      "A magic link was already requested for this email. Please wait before requesting another one.",
      reservation.retry_after_seconds,
      reservation.retry_at
    );
  }

  const authClient = createSupabaseAuthClient();
  const { error } = await authClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${new URL(request.url).origin}/auth/callback`,
      shouldCreateUser: true
    }
  });

  if (!error) {
    return NextResponse.json({
      message:
        "Magic link sent. Check your inbox and spam folder before requesting another link.",
      retryAfterSeconds: SUCCESS_COOLDOWN_SECONDS,
      retryAt: reservation.retry_at
    });
  }

  const isRateLimited = error.status === 429 || /rate limit|too many/i.test(error.message);
  const retryAfterSeconds = isRateLimited
    ? SUPABASE_RATE_LIMIT_COOLDOWN_SECONDS
    : ERROR_COOLDOWN_SECONDS;
  const retryAt = new Date(Date.now() + retryAfterSeconds * 1000).toISOString();

  await admin.from(COOLDOWN_TABLE).upsert(
    {
      email_hash: emailHash,
      next_request_at: retryAt,
      rate_limited_until: isRateLimited ? retryAt : null,
      last_error: error.message,
      updated_at: new Date().toISOString()
    },
    { onConflict: "email_hash" }
  );

  if (isRateLimited) {
    return retryResponse(
      "Supabase is temporarily rate-limiting magic links for this email. Please wait before trying again; repeated attempts reset the wait.",
      retryAfterSeconds,
      retryAt
    );
  }

  return NextResponse.json(
    { error: error.message, retryAfterSeconds, retryAt },
    { status: error.status ?? 400 }
  );
}

async function parseRequest(request: Request) {
  try {
    return magicLinkSchema.safeParse(await request.json());
  } catch {
    return magicLinkSchema.safeParse({});
  }
}

function createSupabaseAuthClient() {
  return createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function retryResponse(message: string, retryAfterSeconds: number, retryAt: string) {
  return NextResponse.json(
    {
      error: `${message} Try again in ${formatCooldown(retryAfterSeconds)}.`,
      retryAfterSeconds,
      retryAt
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds)
      }
    }
  );
}

function hashEmail(email: string) {
  return createHash("sha256").update(email).digest("hex");
}

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function formatCooldown(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}
