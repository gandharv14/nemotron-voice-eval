"use client";

import { FormEvent, useEffect, useState } from "react";

interface Props {
  initialTimezone: string;
}

export function ProfileTimezoneForm({ initialTimezone }: Props) {
  const [timezone, setTimezone] = useState(initialTimezone || "UTC");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!initialTimezone || initialTimezone === "UTC") {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    }
  }, [initialTimezone]);

  async function saveTimezone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tz: timezone })
    });

    setMessage(response.ok ? "Timezone saved." : "Could not save timezone.");
  }

  return (
    <form className="card stack" onSubmit={saveTimezone}>
      <h2>Timezone</h2>
      <p className="muted">
        Calendar input is interpreted in this IANA timezone. All persisted times
        stay in UTC.
      </p>
      <label className="field">
        <span>IANA timezone</span>
        <input
          className="input"
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
          placeholder="America/Los_Angeles"
          required
        />
      </label>
      <button className="button" type="submit">
        Save timezone
      </button>
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
