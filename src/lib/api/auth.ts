import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    };
  }

  return { user, response: null };
}

export function isAdminEmail(email?: string | null) {
  if (!email) {
    return false;
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return adminEmails.includes(email.toLowerCase());
}

export async function ensureProfile(user: { id: string; email?: string | null }) {
  const admin = createSupabaseAdminClient();
  await admin.from("profiles").upsert(
    {
      id: user.id,
      email: user.email ?? "",
      tz: "UTC"
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
}
