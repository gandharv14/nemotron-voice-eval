import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { scheduleRequests } from "../../../src/lib/scheduler/index.ts";
import type {
  ConfirmedSession,
  PendingRequest
} from "../../../src/lib/scheduler/types.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, x-scheduler-secret"
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get("SCHEDULER_EDGE_FUNCTION_SECRET");
  if (expectedSecret) {
    const providedSecret = request.headers.get("x-scheduler-secret");
    if (providedSecret !== expectedSecret) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  const supabaseUrl = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Missing Supabase environment variables" }, 500);
  }

  const startedAt = new Date();
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  const horizonStart = startedAt.toISOString();
  const horizonEnd = new Date(
    startedAt.getTime() + 14 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: snapshot, error: snapshotError } = await supabase.rpc(
    "scheduler_snapshot",
    {
      horizon_start: horizonStart,
      horizon_end: horizonEnd
    }
  );

  if (snapshotError) {
    return json({ error: snapshotError.message }, 500);
  }

  const pending = (snapshot?.pending ?? []) as PendingRequest[];
  const confirmed = (snapshot?.confirmed ?? []) as ConfirmedSession[];
  const result = scheduleRequests(pending, confirmed, startedAt);

  const { data: run, error: applyError } = await supabase.rpc(
    "apply_scheduler_results",
    {
      p_started_at: startedAt.toISOString(),
      p_assignments: result.assignments.map((assignment) => ({
        request_id: assignment.requestId,
        start_at: assignment.startAt,
        end_at: assignment.endAt
      })),
      p_rejections: result.rejections.map((rejection) => ({
        request_id: rejection.requestId,
        reason: rejection.reason
      })),
      p_metrics: result.metrics
    }
  );

  if (applyError) {
    return json({ error: applyError.message }, 500);
  }

  return json({
    run,
    assignments: result.assignments.length,
    rejections: result.rejections.length,
    peakUtilization: result.metrics.peakUtilization
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json"
    }
  });
}
