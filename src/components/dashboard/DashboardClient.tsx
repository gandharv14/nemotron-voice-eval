"use client";

import { useCallback, useEffect, useState } from "react";
import { ProfileTimezoneForm } from "./ProfileTimezoneForm";
import { RequestForm } from "./RequestForm";
import { ScheduleCalendar } from "./ScheduleCalendar";
import { UtilizationChart } from "./UtilizationChart";

interface Profile {
  tz: string;
}

interface RequestRow {
  id: string;
  status: string;
  duration_min: number;
  window_start: string;
  window_end: string;
  reject_reason: string | null;
}

interface SessionRow {
  id: string;
  request_id: string;
  start_at: string;
  end_at: string;
}

export function DashboardClient({ initialProfile }: { initialProfile: Profile }) {
  const [profile, setProfile] = useState(initialProfile);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const refreshSchedule = useCallback(async () => {
    const response = await fetch("/api/requests");
    const body = await response.json();

    if (response.ok) {
      setRequests(body.requests ?? []);
      setSessions(body.sessions ?? []);
    }
  }, []);

  useEffect(() => {
    void refreshSchedule();

    async function refreshProfile() {
      const response = await fetch("/api/profile");
      const body = await response.json();
      if (response.ok && body.profile) {
        setProfile({ tz: body.profile.tz });
      }
    }

    void refreshProfile();
  }, [refreshSchedule]);

  async function cancel(requestId: string) {
    const response = await fetch("/api/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId })
    });
    const body = await response.json().catch(() => ({}));

    setMessage(
      response.ok
        ? body.late
          ? "Canceled, with late fairness penalty applied."
          : "Canceled."
        : body.error ?? "Could not cancel."
    );
    await refreshSchedule();
  }

  return (
    <div className="stack">
      <ProfileTimezoneForm initialTimezone={profile.tz} />
      <div className="grid two">
        <RequestForm timezone={profile.tz} onCreated={refreshSchedule} />
        <UtilizationChart />
      </div>
      {message ? <p className="muted">{message}</p> : null}
      <ScheduleCalendar
        requests={requests}
        sessions={sessions}
        onCancel={cancel}
      />
    </div>
  );
}
