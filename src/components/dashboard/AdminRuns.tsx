"use client";

import { useEffect, useState } from "react";

interface SchedulerRun {
  id: string;
  started_at: string;
  ended_at: string | null;
  requests_seen: number;
  placed: number;
  rejected: number;
  peak_utilization: number;
}

export function AdminRuns() {
  const [runs, setRuns] = useState<SchedulerRun[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function loadRuns() {
    const response = await fetch("/api/admin/scheduler-runs");
    const body = await response.json();
    if (response.ok) {
      setRuns(body.runs ?? []);
    } else {
      setMessage(body.error ?? "Could not load scheduler runs.");
    }
  }

  async function triggerScheduler() {
    setMessage("Triggering scheduler...");
    const response = await fetch("/api/trigger-scheduler", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Scheduler triggered." : body.error ?? "Failed.");
    await loadRuns();
  }

  useEffect(() => {
    void loadRuns();
  }, []);

  return (
    <div className="card stack">
      <div className="nav">
        <div>
          <h1>Scheduler runs</h1>
          <p className="muted">Recent aggregate scheduler outcomes.</p>
        </div>
        <button className="button" type="button" onClick={triggerScheduler}>
          Trigger scheduler
        </button>
      </div>
      {message ? <p>{message}</p> : null}
      <table className="table">
        <thead>
          <tr>
            <th>Started</th>
            <th>Runtime</th>
            <th>Seen</th>
            <th>Placed</th>
            <th>Rejected</th>
            <th>Peak</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td>{new Date(run.started_at).toLocaleString()}</td>
              <td>{runtime(run)}</td>
              <td>{run.requests_seen}</td>
              <td>{run.placed}</td>
              <td>{run.rejected}</td>
              <td>{run.peak_utilization}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function runtime(run: SchedulerRun) {
  if (!run.ended_at) {
    return "running";
  }

  return `${new Date(run.ended_at).getTime() - new Date(run.started_at).getTime()} ms`;
}
