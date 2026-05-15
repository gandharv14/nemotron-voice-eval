"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

interface BucketRow {
  bucket_start: string;
  count: number;
}

export function UtilizationChart() {
  const [buckets, setBuckets] = useState<BucketRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const loadUtilization = useCallback(async () => {
    const response = await fetch("/api/utilization");
    const body = await response.json();

    if (!response.ok) {
      setError(body.error ?? "Could not load utilization.");
      return;
    }

    setBuckets(body.buckets ?? []);
  }, []);

  useEffect(() => {
    void loadUtilization();

    const channel = supabase
      .channel("scheduler-runs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "scheduler_runs" },
        () => {
          void loadUtilization();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadUtilization, supabase]);

  const data = buckets.map((bucket) => ({
    time: new Date(bucket.bucket_start).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }),
    load: bucket.count
  }));

  return (
    <div className="card stack">
      <h2>Global utilization</h2>
      <p className="muted">Aggregate scheduled load for the next 7 days. No PII.</p>
      {error ? <p>{error}</p> : null}
      <div style={{ height: 320 }}>
        <ResponsiveContainer height="100%" width="100%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" minTickGap={48} />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Area
              dataKey="load"
              fill="#2563eb"
              fillOpacity={0.25}
              name="Scheduled users"
              stroke="#2563eb"
              type="monotone"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
