import { NextResponse } from "next/server";
import { isAdminEmail, requireUser } from "@/lib/api/auth";

export async function POST() {
  const { user, response } = await requireUser();
  if (!user) {
    return response;
  }

  if (!(await isAdminEmail(user.email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = process.env.SCHEDULER_EDGE_FUNCTION_URL;
  const secret = process.env.SCHEDULER_EDGE_FUNCTION_SECRET;

  if (!url || !secret) {
    return NextResponse.json(
      { error: "Scheduler Edge Function is not configured" },
      { status: 500 }
    );
  }

  const schedulerResponse = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-scheduler-secret": secret
    },
    body: JSON.stringify({ source: "admin-api" })
  });

  const body = await schedulerResponse.json().catch(() => ({}));

  return NextResponse.json(body, { status: schedulerResponse.status });
}
