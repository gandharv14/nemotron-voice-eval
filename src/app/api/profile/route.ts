import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureProfile, requireUser } from "@/lib/api/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const profileSchema = z.object({
  tz: z.string().min(1)
});

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) {
    return response;
  }

  await ensureProfile(user);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}

export async function PUT(request: Request) {
  const { user, response } = await requireUser();
  if (!user) {
    return response;
  }

  const parsed = profileSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile payload" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update({ tz: parsed.data.tz })
    .eq("id", user.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}
