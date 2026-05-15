import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const cancelSchema = z.object({
  requestId: z.string().uuid()
});

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) {
    return response;
  }

  const parsed = cancelSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid cancel payload" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .select("id, start_at, end_at, user_id")
    .eq("request_id", parsed.data.requestId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  const cutoffHours = Number(process.env.CANCELLATION_CUTOFF_HOURS ?? "1");
  const now = Date.now();
  const startAt = session ? new Date(session.start_at).getTime() : null;
  const isLate =
    startAt !== null && startAt - now < Math.max(0, cutoffHours) * 60 * 60 * 1000;

  if (session) {
    const durationMin = Math.ceil(
      (new Date(session.end_at).getTime() - new Date(session.start_at).getTime()) /
        60_000
    );

    await admin.from("sessions").delete().eq("id", session.id).eq("user_id", user.id);

    if (isLate) {
      await admin.rpc("increment_fairness_score", {
        p_user_id: user.id,
        p_delta: durationMin
      });
    }
  }

  const { data, error } = await admin
    .from("requests")
    .update({ status: "canceled" })
    .eq("id", parsed.data.requestId)
    .eq("user_id", user.id)
    .in("status", ["pending", "confirmed"])
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from("notifications").insert({
    user_id: user.id,
    kind: "request_canceled",
    payload: {
      requestId: parsed.data.requestId,
      late: isLate
    }
  });

  return NextResponse.json({ request: data, late: isLate });
}
