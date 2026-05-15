import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

export interface RequestWindowInput {
  durationMin: number;
  windowStart: string;
  windowEnd: string;
  tz: string;
  rigid: boolean;
  recurrence?: {
    weeks: number;
    weekdays: number[];
  };
}

export interface ExpandedRequest {
  duration_min: number;
  window_start: string;
  window_end: string;
  rigid: boolean;
}

export function expandRequestWindows(input: RequestWindowInput): ExpandedRequest[] {
  const recurrence = input.recurrence;

  if (!recurrence || recurrence.weeks <= 0 || recurrence.weekdays.length === 0) {
    return [toRequestRow(input, input.windowStart, input.windowEnd)];
  }

  const startDate = parseISO(input.windowStart);
  const endDate = parseISO(input.windowEnd);
  const daySpan = Math.max(0, differenceInCalendarDays(endDate, startDate));
  const rows: ExpandedRequest[] = [];

  for (let dayOffset = 0; dayOffset < recurrence.weeks * 7; dayOffset += 1) {
    const candidate = addDays(startDate, dayOffset);

    if (!recurrence.weekdays.includes(candidate.getDay())) {
      continue;
    }

    const candidateStart = withDate(input.windowStart, candidate);
    const candidateEnd = withDate(input.windowEnd, addDays(candidate, daySpan));
    rows.push(toRequestRow(input, candidateStart, candidateEnd));
  }

  return rows;
}

function toRequestRow(
  input: RequestWindowInput,
  windowStart: string,
  windowEnd: string
): ExpandedRequest {
  return {
    duration_min: input.durationMin,
    window_start: fromZonedTime(windowStart, input.tz).toISOString(),
    window_end: fromZonedTime(windowEnd, input.tz).toISOString(),
    rigid: input.rigid
  };
}

function withDate(template: string, date: Date) {
  const timePart = template.includes("T")
    ? template.slice(template.indexOf("T"))
    : "T00:00";

  return `${date.toISOString().slice(0, 10)}${timePart}`;
}
