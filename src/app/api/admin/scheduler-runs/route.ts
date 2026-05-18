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
    .from("scheduler_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(25);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ runs: data });
}
