import { NextResponse } from "next/server";
import { isAdminEmail, requireUser } from "@/lib/api/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) {
    return response;
  }

  if (!(await isAdminEmail(user.email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, fairness_score, tz")
    .order("fairness_score", { ascending: false })
    .order("email", { ascending: true })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profiles: data ?? [] });
}
