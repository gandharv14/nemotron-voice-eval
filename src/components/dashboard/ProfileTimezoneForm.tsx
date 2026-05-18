"use client";

import { FormEvent, useEffect, useId, useMemo, useState } from "react";

interface Props {
  initialTimezone: string;
}

const FALLBACK_TIMEZONES = [
  "UTC",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/Anchorage",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Chicago",
  "America/Denver",
  "America/Halifax",
  "America/Lima",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Phoenix",
  "America/Santiago",
  "America/Sao_Paulo",
  "America/St_Johns",
  "America/Toronto",
  "America/Vancouver",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Jakarta",
  "Asia/Jerusalem",
  "Asia/Kolkata",
  "Asia/Karachi",
  "Asia/Kuala_Lumpur",
  "Asia/Manila",
  "Asia/Riyadh",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Taipei",
  "Asia/Tehran",
  "Asia/Tokyo",
  "Atlantic/Azores",
  "Atlantic/Reykjavik",
  "Australia/Adelaide",
  "Australia/Brisbane",
  "Australia/Melbourne",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Athens",
  "Europe/Berlin",
  "Europe/Brussels",
  "Europe/Bucharest",
  "Europe/Dublin",
  "Europe/Helsinki",
  "Europe/Istanbul",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Moscow",
  "Europe/Oslo",
  "Europe/Paris",
  "Europe/Prague",
  "Europe/Rome",
  "Europe/Stockholm",
  "Europe/Vienna",
  "Europe/Warsaw",
  "Europe/Zurich",
  "Pacific/Auckland",
  "Pacific/Fiji",
  "Pacific/Honolulu"
];

function getAllTimezones(): string[] {
  const supportedValuesOf = (
    Intl as typeof Intl & {
      supportedValuesOf?: (key: string) => string[];
    }
  ).supportedValuesOf;

  if (typeof supportedValuesOf === "function") {
    try {
      const zones = supportedValuesOf("timeZone");
      if (Array.isArray(zones) && zones.length > 0) {
        return zones.includes("UTC") ? zones : ["UTC", ...zones];
      }
    } catch {
      // fall through to fallback list
    }
  }

  return FALLBACK_TIMEZONES;
}

function formatOffset(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "shortOffset"
    }).formatToParts(new Date());
    const offset = parts.find((part) => part.type === "timeZoneName")?.value;
    return offset ?? "";
  } catch {
    return "";
  }
}

export function ProfileTimezoneForm({ initialTimezone }: Props) {
  const datalistId = useId();
  const [timezone, setTimezone] = useState(initialTimezone || "UTC");
  const [message, setMessage] = useState<string | null>(null);
  const [timezones, setTimezones] = useState<string[]>(() =>
    initialTimezone ? [initialTimezone || "UTC"] : ["UTC"]
  );
  const [mode, setMode] = useState<"dropdown" | "search">("dropdown");

  useEffect(() => {
    setTimezones(getAllTimezones());

    if (!initialTimezone || initialTimezone === "UTC") {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    }
  }, [initialTimezone]);

  const groupedTimezones = useMemo(() => {
    const groups = new Map<string, { value: string; label: string }[]>();

    for (const zone of timezones) {
      const [region, ...rest] = zone.split("/");
      const groupName = rest.length === 0 ? "Other" : region;
      const cityLabel =
        rest.length === 0 ? zone : rest.join("/").replace(/_/g, " ");
      const offset = formatOffset(zone);
      const label = offset ? `${cityLabel} (${offset})` : cityLabel;

      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName)!.push({ value: zone, label });
    }

    for (const list of groups.values()) {
      list.sort((a, b) => a.label.localeCompare(b.label));
    }

    return Array.from(groups.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    );
  }, [timezones]);

  const datalistOptions = useMemo(() => {
    return timezones
      .map((zone) => {
        const offset = formatOffset(zone);
        return {
          value: zone,
          label: offset ? `${zone} (${offset})` : zone
        };
      })
      .sort((a, b) => a.value.localeCompare(b.value));
  }, [timezones]);

  async function saveTimezone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!timezones.includes(timezone)) {
      setMessage("Pick a valid IANA timezone from the list.");
      return;
    }

    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tz: timezone })
    });

    setMessage(response.ok ? "Timezone saved." : "Could not save timezone.");
  }

  const selectedInList = timezones.includes(timezone);
  const totalCount = timezones.length;

  return (
    <form className="card stack" onSubmit={saveTimezone}>
      <h2>Timezone</h2>
      <p className="muted">
        Calendar input is interpreted in this IANA timezone. All persisted times
        stay in UTC.
      </p>

      <div
        className="stack"
        style={{ gap: 6 }}
        role="radiogroup"
        aria-label="Timezone picker mode"
      >
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className={`button ${mode === "dropdown" ? "" : "secondary"}`}
            onClick={() => setMode("dropdown")}
            aria-pressed={mode === "dropdown"}
          >
            Dropdown
          </button>
          <button
            type="button"
            className={`button ${mode === "search" ? "" : "secondary"}`}
            onClick={() => setMode("search")}
            aria-pressed={mode === "search"}
          >
            Search
          </button>
        </div>
      </div>

      {mode === "dropdown" ? (
        <label className="field">
          <span>IANA timezone</span>
          <select
            className="input"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            required
          >
            {!selectedInList ? (
              <option value={timezone}>{timezone}</option>
            ) : null}
            {groupedTimezones.map(([groupName, options]) => (
              <optgroup key={groupName} label={groupName}>
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="muted" style={{ fontSize: "0.8rem" }}>
            {totalCount} timezones grouped by region. Open the menu and type
            the first few letters of a city to jump to it.
          </span>
        </label>
      ) : (
        <label className="field">
          <span>IANA timezone</span>
          <input
            className="input"
            list={datalistId}
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            placeholder="Start typing a city, e.g. New_York"
            autoComplete="off"
            spellCheck={false}
            required
          />
          <datalist id={datalistId}>
            {datalistOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </datalist>
          <span className="muted" style={{ fontSize: "0.8rem" }}>
            {totalCount} timezones available. Type any part of the IANA name
            (e.g. &ldquo;Tokyo&rdquo;, &ldquo;Europe/&rdquo;, &ldquo;Los&rdquo;)
            to filter.
          </span>
        </label>
      )}

      <button className="button" type="submit">
        Save timezone
      </button>
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
