import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  ConfirmedSession,
  PendingRequest,
  scheduleRequests,
  SchedulerAssignment
} from ".";

const now = new Date("2026-05-15T12:00:00.000Z");

describe("scheduleRequests", () => {
  it("places a flexible request in a feasible bucket range", () => {
    const result = scheduleRequests(
      [
        request({
          id: "request-1",
          durationMin: 60,
          windowStart: "2026-05-15T14:00:00.000Z",
          windowEnd: "2026-05-15T22:00:00.000Z"
        })
      ],
      [],
      now
    );

    expect(result.assignments).toHaveLength(1);
    expect(result.rejections).toHaveLength(0);
    expect(result.assignments[0].startAt).toBe("2026-05-15T14:00:00.000Z");
    expect(result.assignments[0].endAt).toBe("2026-05-15T15:00:00.000Z");
  });

  it("pins confirmed sessions and rejects when the cap would be violated", () => {
    const confirmed = Array.from({ length: 100 }, (_, index) =>
      session({
        id: `session-${index}`,
        requestId: `confirmed-${index}`,
        startAt: "2026-05-15T14:00:00.000Z",
        endAt: "2026-05-15T15:00:00.000Z"
      })
    );

    const result = scheduleRequests(
      [
        request({
          id: "rigid-1",
          rigid: true,
          durationMin: 60,
          windowStart: "2026-05-15T14:00:00.000Z",
          windowEnd: "2026-05-15T15:00:00.000Z"
        })
      ],
      confirmed,
      now
    );

    expect(result.assignments).toHaveLength(0);
    expect(result.rejections).toEqual([
      {
        requestId: "rigid-1",
        userId: "user-1",
        reason: "would violate cap"
      }
    ]);
  });

  it("uses fairness score as a tiebreaker when flexibility matches", () => {
    const result = scheduleRequests(
      [
        request({
          id: "served-user",
          userId: "user-served",
          fairnessScore: -100,
          durationMin: 60,
          windowStart: "2026-05-15T14:00:00.000Z",
          windowEnd: "2026-05-15T15:00:00.000Z"
        }),
        request({
          id: "underserved-user",
          userId: "user-under",
          fairnessScore: 200,
          durationMin: 60,
          windowStart: "2026-05-15T14:00:00.000Z",
          windowEnd: "2026-05-15T15:00:00.000Z"
        })
      ],
      [],
      now,
      { capacity: 1 }
    );

    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].requestId).toBe("underserved-user");
    expect(result.rejections[0].requestId).toBe("served-user");
  });

  it("keeps load at or below capacity for randomized workloads", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            durationBuckets: fc.integer({ min: 1, max: 24 }),
            startBucket: fc.integer({ min: 0, max: 120 }),
            extraFlexBuckets: fc.integer({ min: 0, max: 48 }),
            fairnessScore: fc.integer({ min: -500, max: 500 }),
            rigid: fc.boolean()
          }),
          { minLength: 1, maxLength: 140 }
        ),
        (items) => {
          const pending = items.map((item, index) => {
            const start = addMinutes(now, item.startBucket * 5);
            const durationMin = item.durationBuckets * 5;
            const end = addMinutes(
              start,
              item.rigid
                ? durationMin
                : durationMin + item.extraFlexBuckets * 5
            );

            return request({
              id: `request-${index}`,
              userId: `user-${index % 30}`,
              durationMin,
              windowStart: start.toISOString(),
              windowEnd: end.toISOString(),
              rigid: item.rigid,
              fairnessScore: item.fairnessScore
            });
          });

          const result = scheduleRequests(pending, [], now, { capacity: 7 });

          expect(maxLoad(result.assignments)).toBeLessThanOrEqual(7);
          expect(result.assignments.length + result.rejections.length).toBe(
            pending.length
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

function request(overrides: Partial<PendingRequest>): PendingRequest {
  return {
    id: "request",
    userId: "user-1",
    durationMin: 60,
    windowStart: "2026-05-15T14:00:00.000Z",
    windowEnd: "2026-05-15T16:00:00.000Z",
    rigid: false,
    createdAt: "2026-05-15T12:00:00.000Z",
    fairnessScore: 0,
    ...overrides
  };
}

function session(overrides: Partial<ConfirmedSession>): ConfirmedSession {
  return {
    id: "session",
    requestId: "confirmed-request",
    userId: "user-1",
    startAt: "2026-05-15T14:00:00.000Z",
    endAt: "2026-05-15T15:00:00.000Z",
    ...overrides
  };
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function maxLoad(assignments: SchedulerAssignment[]) {
  const buckets = new Map<number, number>();
  const bucketMs = 5 * 60_000;

  for (const assignment of assignments) {
    const start = new Date(assignment.startAt).getTime();
    const end = new Date(assignment.endAt).getTime();

    for (let bucket = start; bucket < end; bucket += bucketMs) {
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
  }

  return Math.max(0, ...buckets.values());
}
