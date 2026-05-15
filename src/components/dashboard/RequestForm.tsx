"use client";

import { FormEvent, useState } from "react";

const weekdays = [
  ["0", "Sun"],
  ["1", "Mon"],
  ["2", "Tue"],
  ["3", "Wed"],
  ["4", "Thu"],
  ["5", "Fri"],
  ["6", "Sat"]
] as const;

interface Props {
  timezone: string;
  onCreated: () => void;
}

export function RequestForm({ timezone, onCreated }: Props) {
  const [durationMin, setDurationMin] = useState(60);
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [rigid, setRigid] = useState(false);
  const [recurrenceWeeks, setRecurrenceWeeks] = useState(0);
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const response = await fetch("/api/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        durationMin,
        windowStart,
        windowEnd,
        tz: timezone,
        rigid,
        recurrence:
          recurrenceWeeks > 0 && selectedWeekdays.length > 0
            ? {
                weeks: recurrenceWeeks,
                weekdays: selectedWeekdays
              }
            : undefined
      })
    });

    setLoading(false);
    setMessage(response.ok ? "Request submitted." : "Could not submit request.");

    if (response.ok) {
      onCreated();
    }
  }

  function toggleWeekday(day: number) {
    setSelectedWeekdays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day]
    );
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Request a session</h2>
      <label className="field">
        <span>Duration, minutes</span>
        <input
          className="input"
          min={5}
          max={480}
          step={5}
          type="number"
          value={durationMin}
          onChange={(event) => setDurationMin(Number(event.target.value))}
          required
        />
      </label>
      <label className="field">
        <span>Earliest acceptable start ({timezone})</span>
        <input
          className="input"
          type="datetime-local"
          value={windowStart}
          onChange={(event) => setWindowStart(event.target.value)}
          required
        />
      </label>
      <label className="field">
        <span>Latest acceptable end ({timezone})</span>
        <input
          className="input"
          type="datetime-local"
          value={windowEnd}
          onChange={(event) => setWindowEnd(event.target.value)}
          required
        />
      </label>
      <label>
        <input
          checked={rigid}
          onChange={(event) => setRigid(event.target.checked)}
          type="checkbox"
        />{" "}
        Rigid request: the window is the exact slot
      </label>
      <div className="stack">
        <label className="field">
          <span>Repeat for N weeks (optional)</span>
          <input
            className="input"
            min={0}
            max={8}
            type="number"
            value={recurrenceWeeks}
            onChange={(event) => setRecurrenceWeeks(Number(event.target.value))}
          />
        </label>
        <div className="nav-links">
          {weekdays.map(([value, label]) => {
            const day = Number(value);
            return (
              <label className="pill" key={value}>
                <input
                  checked={selectedWeekdays.includes(day)}
                  onChange={() => toggleWeekday(day)}
                  type="checkbox"
                />{" "}
                {label}
              </label>
            );
          })}
        </div>
      </div>
      <button className="button" disabled={loading} type="submit">
        {loading ? "Submitting..." : "Submit request"}
      </button>
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
