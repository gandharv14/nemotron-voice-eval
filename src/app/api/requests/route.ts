import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureProfile, requireUser } from "@/lib/api/auth";
import { expandRequestWindows } from "@/lib/api/request-expansion";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const createRequestSchema = z.object({
  durationMin: z.number().int().min(5).max(480).refine((value) => value % 5 === 0),
  windowStart: z.string().min(1),
  windowEnd: z.string().min(1),
  tz: z.string().min(1).default("UTC"),
  rigid: z.boolean().default(false),
  recurrence: z
    .object({
      weeks: z.number().int().min(1).max(8),
      weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7)
    })
    .optional()
});

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) {
    return response;
  }

  const admin = createSupabaseAdminClient();
  const [requestsResult, sessionsResult] = await Promise.all([
    admin
      .from("requests")
      .select("*")
      .eq("user_id", user.id)
      .order("window_start", { ascending: false }),
    admin
      .from("sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("start_at", { ascending: true })
  ]);

  if (requestsResult.error) {
    return NextResponse.json({ error: requestsResult.error.message }, { status: 500 });
  }

  if (sessionsResult.error) {
    return NextResponse.json({ error: sessionsResult.error.message }, { status: 500 });
  }

  return NextResponse.json({
    requests: requestsResult.data,
    sessions: sessionsResult.data
  });
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) {
    return response;
  }

  await ensureProfile(user);

  const parsed = createRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const rows = expandRequestWindows(parsed.data).map((row) => ({
    ...row,
    user_id: user.id
  }));

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("requests").insert(rows).select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (rows.some((row) => row.rigid)) {
    await triggerSchedulerOnDemand();
  }

  return NextResponse.json({ requests: data }, { status: 201 });
}

async function triggerSchedulerOnDemand() {
  const url = process.env.SCHEDULER_EDGE_FUNCTION_URL;
  const secret = process.env.SCHEDULER_EDGE_FUNCTION_SECRET;

  if (!url || !secret) {
    return;
  }

  await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-scheduler-secret": secret
    },
    body: JSON.stringify({ source: "api-rigid-request" })
  }).catch(() => undefined);
}
