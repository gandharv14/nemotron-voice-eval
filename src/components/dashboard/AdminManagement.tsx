"use client";

import { FormEvent, useEffect, useState } from "react";

interface AdminEntry {
  email: string;
  createdAt: string | null;
  preset: boolean;
}

export function AdminManagement() {
  const [admins, setAdmins] = useState<AdminEntry[]>([]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadAdmins() {
    try {
      const response = await fetch("/api/admin/admins");
      const body = await response.json();
      if (response.ok) {
        setAdmins(body.admins ?? []);
        setError(null);
      } else {
        setError(body.error ?? "Could not load admins.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load admins.");
    }
  }

  useEffect(() => {
    void loadAdmins();
  }, []);

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Enter an email address.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: trimmed })
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        setAdmins(body.admins ?? []);
        setEmail("");
        setMessage(`Added ${trimmed} as admin.`);
      } else {
        setError(body.error ?? "Could not add admin.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add admin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(target: string) {
    setMessage(null);
    setError(null);

    if (!confirm(`Remove ${target} from admins?`)) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/admins?email=${encodeURIComponent(target)}`,
        { method: "DELETE" }
      );
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        setAdmins(body.admins ?? []);
        setMessage(`Removed ${target}.`);
      } else {
        setError(body.error ?? "Could not remove admin.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove admin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      <div>
        <h2>Admin access</h2>
        <p className="muted">
          Preset admins are always allowed. Add additional admins below.
        </p>
      </div>

      <form className="nav" onSubmit={handleAdd}>
        <input
          aria-label="Admin email"
          className="input"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="user@example.com"
          style={{ flex: 1, minWidth: 240 }}
          type="email"
          value={email}
        />
        <button className="button" disabled={busy} type="submit">
          {busy ? "Saving..." : "Add admin"}
        </button>
      </form>

      {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
      {message ? <p>{message}</p> : null}

      <table className="table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Source</th>
            <th>Added</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {admins.map((entry) => (
            <tr key={entry.email}>
              <td>{entry.email}</td>
              <td>
                {entry.preset ? (
                  <span className="pill">Preset</span>
                ) : (
                  <span className="muted">Custom</span>
                )}
              </td>
              <td>
                {entry.createdAt
                  ? new Date(entry.createdAt).toLocaleString()
                  : "—"}
              </td>
              <td style={{ textAlign: "right" }}>
                {entry.preset ? null : (
                  <button
                    className="button danger"
                    disabled={busy}
                    onClick={() => handleRemove(entry.email)}
                    type="button"
                  >
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
          {admins.length === 0 ? (
            <tr>
              <td className="muted" colSpan={4}>
                No admins configured.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
