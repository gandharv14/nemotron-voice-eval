"use client";

import { useMemo } from "react";
import { Calendar, dateFnsLocalizer, Event } from "react-big-calendar";
import { format, getDay, parse, startOfWeek } from "date-fns";
import { enUS } from "date-fns/locale/en-US";

interface SessionRow {
  id: string;
  request_id: string;
  start_at: string;
  end_at: string;
}

interface RequestRow {
  id: string;
  status: string;
  duration_min: number;
  window_start: string;
  window_end: string;
  reject_reason: string | null;
}

interface Props {
  sessions: SessionRow[];
  requests: RequestRow[];
  onCancel: (requestId: string) => Promise<void>;
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales: { "en-US": enUS }
});

export function ScheduleCalendar({ sessions, requests, onCancel }: Props) {
  const events: Event[] = useMemo(
    () =>
      sessions.map((session) => ({
        title: "Confirmed GPU session",
        start: new Date(session.start_at),
        end: new Date(session.end_at),
        resource: session
      })),
    [sessions]
  );

  const pending = requests.filter((request) => request.status === "pending");
  const rejected = requests.filter((request) => request.status === "rejected");

  return (
    <div className="card stack">
      <h2>My schedule</h2>
      <div className="calendar-wrap">
        <Calendar
          defaultView="week"
          events={events}
          localizer={localizer}
          popup
          startAccessor="start"
          endAccessor="end"
        />
      </div>
      <section className="stack">
        <h3>Confirmed sessions</h3>
        {sessions.length === 0 ? <p className="muted">No confirmed sessions.</p> : null}
        {sessions.map((session) => (
          <div className="card stack" key={session.id}>
            <strong>{new Date(session.start_at).toLocaleString()}</strong>
            <span className="muted">
              Ends {new Date(session.end_at).toLocaleString()}
            </span>
            <button
              className="button danger"
              type="button"
              onClick={() => onCancel(session.request_id)}
            >
              Cancel
            </button>
          </div>
        ))}
      </section>
      <section className="grid two">
        <div className="stack">
          <h3>Pending</h3>
          {pending.length === 0 ? <p className="muted">No pending requests.</p> : null}
          {pending.map((request) => (
            <RequestSummary key={request.id} request={request} onCancel={onCancel} />
          ))}
        </div>
        <div className="stack">
          <h3>Rejected</h3>
          {rejected.length === 0 ? <p className="muted">No rejected requests.</p> : null}
          {rejected.map((request) => (
            <RequestSummary key={request.id} request={request} />
          ))}
        </div>
      </section>
    </div>
  );
}

function RequestSummary({
  request,
  onCancel
}: {
  request: RequestRow;
  onCancel?: (requestId: string) => Promise<void>;
}) {
  return (
    <div className="card stack">
      <strong>
        {request.duration_min} min, {request.status}
      </strong>
      <span className="muted">
        Window {new Date(request.window_start).toLocaleString()} to{" "}
        {new Date(request.window_end).toLocaleString()}
      </span>
      {request.reject_reason ? <span>{request.reject_reason}</span> : null}
      {onCancel ? (
        <button
          className="button secondary"
          type="button"
          onClick={() => onCancel(request.id)}
        >
          Cancel request
        </button>
      ) : null}
    </div>
  );
}
