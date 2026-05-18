"use client";

import { useEffect, useState } from "react";

interface FairnessRow {
  id: string;
  email: string;
  fairness_score: number;
  tz: string;
}

export function AdminFairness() {
  const [rows, setRows] = useState<FairnessRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/fairness");
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        setRows(body.profiles ?? []);
        setError(null);
      } else {
        setError(body.error ?? "Could not load fairness scores.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load fairness scores.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="card stack">
      <div className="nav">
        <div>
          <h1>Fairness scores</h1>
          <p className="muted">
            Higher scores indicate more rejected or late-canceled minutes and
            receive priority as a scheduler tiebreaker. Positive values raise
            priority; negative values mean the user has already been served
            more than their share.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => void load()}
          type="button"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}

      <table className="table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Timezone</th>
            <th style={{ textAlign: "right" }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.email}</td>
              <td className="muted">{row.tz}</td>
              <td style={{ textAlign: "right" }}>
                <strong>{row.fairness_score}</strong>
              </td>
            </tr>
          ))}
          {rows.length === 0 && !loading ? (
            <tr>
              <td className="muted" colSpan={3}>
                No profiles yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
