import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const PRESET_ADMIN_EMAILS: readonly string[] = [
  "gmahajan@labelbox.com",
  "rsingh@labelbox.com"
];

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

export function isPresetAdminEmail(email?: string | null) {
  if (!email) {
    return false;
  }

  const normalized = email.trim().toLowerCase();
  return PRESET_ADMIN_EMAILS.some((value) => value.toLowerCase() === normalized);
}

function envAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export async function isAdminEmail(email?: string | null) {
  if (!email) {
    return false;
  }

  const normalized = email.trim().toLowerCase();

  if (isPresetAdminEmail(normalized)) {
    return true;
  }

  if (envAdminEmails().includes(normalized)) {
    return true;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("admin_emails")
    .select("email")
    .ilike("email", normalized)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("isAdminEmail lookup failed", error);
    return false;
  }

  return Boolean(data);
}

export async function listAdminEmails() {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("admin_emails")
    .select("email, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const dbEmails = (data ?? []).map((row) => ({
    email: row.email as string,
    createdAt: row.created_at as string,
    preset: false
  }));

  const preset = PRESET_ADMIN_EMAILS.map((email) => ({
    email,
    createdAt: null as string | null,
    preset: true
  }));

  const seen = new Set(preset.map((item) => item.email.toLowerCase()));
  const merged = [
    ...preset,
    ...dbEmails.filter((item) => !seen.has(item.email.toLowerCase()))
  ];

  return merged;
}

export async function addAdminEmail(email: string, addedBy: string | null) {
  const normalized = email.trim().toLowerCase();
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("admin_emails")
    .upsert(
      { email: normalized, added_by: addedBy },
      { onConflict: "email", ignoreDuplicates: true }
    );

  if (error) {
    throw new Error(error.message);
  }
}

export async function removeAdminEmail(email: string) {
  const normalized = email.trim().toLowerCase();

  if (isPresetAdminEmail(normalized)) {
    throw new Error("Cannot remove a preset admin");
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("admin_emails")
    .delete()
    .ilike("email", normalized);

  if (error) {
    throw new Error(error.message);
  }
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
