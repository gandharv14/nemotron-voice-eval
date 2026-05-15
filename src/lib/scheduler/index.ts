import {
  ConfirmedSession,
  defaultSchedulerConfig,
  PendingRequest,
  SchedulerAssignment,
  SchedulerConfig,
  SchedulerRejection,
  SchedulerResult
} from "./types.ts";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

interface NormalizedRequest extends PendingRequest {
  windowStartMs: number;
  windowEndMs: number;
  createdAtMs: number;
  durationMs: number;
  durationBuckets: number;
  flexibilityMs: number;
}

interface Candidate {
  startBucket: number;
  bucketCount: number;
  minRemainingCapacity: number;
  totalRemainingCapacity: number;
}

export type SchedulerEngine = (
  pending: PendingRequest[],
  confirmed: ConfirmedSession[],
  now: Date,
  config?: Partial<SchedulerConfig>
) => SchedulerResult;

export const scheduleRequests: SchedulerEngine = (
  pending,
  confirmed,
  now,
  partialConfig = {}
) => {
  const config = { ...defaultSchedulerConfig, ...partialConfig };
  const bucketMs = config.bucketMinutes * MINUTE_MS;
  const horizonStartMs = floorToBucket(now.getTime(), bucketMs);
  const horizonEndMs = horizonStartMs + config.horizonDays * DAY_MS;
  const bucketCount = Math.ceil((horizonEndMs - horizonStartMs) / bucketMs);
  const load = Array.from({ length: bucketCount }, () => 0);

  for (const session of confirmed) {
    addIntervalToLoad(
      load,
      horizonStartMs,
      bucketMs,
      toMs(session.startAt),
      toMs(session.endAt),
      1
    );
  }

  const assignments: SchedulerAssignment[] = [];
  const rejections: SchedulerRejection[] = [];
  const normalized: NormalizedRequest[] = [];

  for (const request of pending) {
    const normalizedRequest = normalizeRequest(request, config, bucketMs);

    if (!normalizedRequest) {
      rejections.push({
        requestId: request.id,
        userId: request.userId,
        reason: "no feasible window"
      });
      continue;
    }

    normalized.push(normalizedRequest);
  }

  normalized.sort(compareRequests);

  for (const request of normalized) {
    const placement = findBestCandidate(
      request,
      load,
      horizonStartMs,
      horizonEndMs,
      bucketMs,
      config.capacity
    );

    if (!placement) {
      rejections.push({
        requestId: request.id,
        userId: request.userId,
        reason: hasAnyCandidate(request, horizonStartMs, horizonEndMs, bucketMs)
          ? "would violate cap"
          : "no feasible window"
      });
      continue;
    }

    for (
      let bucket = placement.startBucket;
      bucket < placement.startBucket + placement.bucketCount;
      bucket += 1
    ) {
      load[bucket] += 1;
    }

    const startAtMs = horizonStartMs + placement.startBucket * bucketMs;
    const endAtMs = startAtMs + placement.bucketCount * bucketMs;

    assignments.push({
      requestId: request.id,
      userId: request.userId,
      startAt: new Date(startAtMs).toISOString(),
      endAt: new Date(endAtMs).toISOString()
    });
  }

  const peakUtilization = load.reduce((peak, value) => Math.max(peak, value), 0);
  const assignedMinutes = assignments.reduce((total, assignment) => {
    return total + (toMs(assignment.endAt) - toMs(assignment.startAt)) / MINUTE_MS;
  }, 0);

  return {
    assignments,
    rejections,
    metrics: {
      requestsSeen: pending.length,
      placed: assignments.length,
      rejected: rejections.length,
      peakUtilization,
      assignedMinutes
    }
  };
};

export * from "./types.ts";

function normalizeRequest(
  request: PendingRequest,
  config: SchedulerConfig,
  bucketMs: number
): NormalizedRequest | null {
  if (
    request.durationMin < config.minDurationMinutes ||
    request.durationMin > config.maxDurationMinutes ||
    request.durationMin % config.bucketMinutes !== 0
  ) {
    return null;
  }

  const windowStartMs = toMs(request.windowStart);
  const windowEndMs = toMs(request.windowEnd);
  const createdAtMs = toMs(request.createdAt);
  const durationMs = request.durationMin * MINUTE_MS;

  if (windowEndMs <= windowStartMs || windowEndMs - windowStartMs < durationMs) {
    return null;
  }

  const rigidDurationMs = request.rigid ? windowEndMs - windowStartMs : durationMs;
  const durationBuckets = Math.ceil(rigidDurationMs / bucketMs);

  return {
    ...request,
    windowStartMs,
    windowEndMs,
    createdAtMs,
    durationMs: rigidDurationMs,
    durationBuckets,
    flexibilityMs: windowEndMs - windowStartMs - rigidDurationMs
  };
}

function compareRequests(a: NormalizedRequest, b: NormalizedRequest) {
  if (a.flexibilityMs !== b.flexibilityMs) {
    return a.flexibilityMs - b.flexibilityMs;
  }

  if (a.fairnessScore !== b.fairnessScore) {
    return b.fairnessScore - a.fairnessScore;
  }

  return a.createdAtMs - b.createdAtMs;
}

function findBestCandidate(
  request: NormalizedRequest,
  load: number[],
  horizonStartMs: number,
  horizonEndMs: number,
  bucketMs: number,
  capacity: number
) {
  const candidateRange = getCandidateRange(
    request,
    horizonStartMs,
    horizonEndMs,
    bucketMs
  );

  if (!candidateRange) {
    return null;
  }

  const [firstStartBucket, lastStartBucket] = candidateRange;
  let best: Candidate | null = null;

  for (
    let startBucket = firstStartBucket;
    startBucket <= lastStartBucket;
    startBucket += 1
  ) {
    const candidate = scoreCandidate(
      load,
      startBucket,
      request.durationBuckets,
      capacity
    );

    if (!candidate) {
      continue;
    }

    if (!best || compareCandidates(candidate, best) > 0) {
      best = candidate;
    }
  }

  return best;
}

function hasAnyCandidate(
  request: NormalizedRequest,
  horizonStartMs: number,
  horizonEndMs: number,
  bucketMs: number
) {
  return getCandidateRange(request, horizonStartMs, horizonEndMs, bucketMs) !== null;
}

function getCandidateRange(
  request: NormalizedRequest,
  horizonStartMs: number,
  horizonEndMs: number,
  bucketMs: number
): [number, number] | null {
  const effectiveStartMs = Math.max(request.windowStartMs, horizonStartMs);
  const effectiveEndMs = Math.min(request.windowEndMs, horizonEndMs);

  if (request.rigid) {
    if (
      request.windowStartMs < horizonStartMs ||
      request.windowEndMs > horizonEndMs ||
      !isBucketAligned(request.windowStartMs, bucketMs) ||
      !isBucketAligned(request.windowEndMs, bucketMs)
    ) {
      return null;
    }

    const rigidBucket = bucketIndex(request.windowStartMs, horizonStartMs, bucketMs);
    return [rigidBucket, rigidBucket];
  }

  const firstStartMs = ceilToBucket(effectiveStartMs, bucketMs);
  const lastStartMs = floorToBucket(
    effectiveEndMs - request.durationBuckets * bucketMs,
    bucketMs
  );

  if (lastStartMs < firstStartMs) {
    return null;
  }

  return [
    bucketIndex(firstStartMs, horizonStartMs, bucketMs),
    bucketIndex(lastStartMs, horizonStartMs, bucketMs)
  ];
}

function scoreCandidate(
  load: number[],
  startBucket: number,
  bucketCount: number,
  capacity: number
): Candidate | null {
  if (startBucket < 0 || startBucket + bucketCount > load.length) {
    return null;
  }

  let minRemainingCapacity = Number.POSITIVE_INFINITY;
  let totalRemainingCapacity = 0;

  for (let bucket = startBucket; bucket < startBucket + bucketCount; bucket += 1) {
    const remainingCapacity = capacity - load[bucket];

    if (remainingCapacity <= 0) {
      return null;
    }

    minRemainingCapacity = Math.min(minRemainingCapacity, remainingCapacity);
    totalRemainingCapacity += remainingCapacity;
  }

  return {
    startBucket,
    bucketCount,
    minRemainingCapacity,
    totalRemainingCapacity
  };
}

function compareCandidates(a: Candidate, b: Candidate) {
  if (a.minRemainingCapacity !== b.minRemainingCapacity) {
    return a.minRemainingCapacity - b.minRemainingCapacity;
  }

  if (a.totalRemainingCapacity !== b.totalRemainingCapacity) {
    return a.totalRemainingCapacity - b.totalRemainingCapacity;
  }

  return b.startBucket - a.startBucket;
}

function addIntervalToLoad(
  load: number[],
  horizonStartMs: number,
  bucketMs: number,
  startMs: number,
  endMs: number,
  delta: number
) {
  const startBucket = Math.max(
    0,
    bucketIndex(floorToBucket(startMs, bucketMs), horizonStartMs, bucketMs)
  );
  const endBucket = Math.min(
    load.length,
    bucketIndex(ceilToBucket(endMs, bucketMs), horizonStartMs, bucketMs)
  );

  for (let bucket = startBucket; bucket < endBucket; bucket += 1) {
    load[bucket] += delta;
  }
}

function bucketIndex(timestampMs: number, horizonStartMs: number, bucketMs: number) {
  return Math.floor((timestampMs - horizonStartMs) / bucketMs);
}

function floorToBucket(timestampMs: number, bucketMs: number) {
  return Math.floor(timestampMs / bucketMs) * bucketMs;
}

function ceilToBucket(timestampMs: number, bucketMs: number) {
  return Math.ceil(timestampMs / bucketMs) * bucketMs;
}

function isBucketAligned(timestampMs: number, bucketMs: number) {
  return timestampMs % bucketMs === 0;
}

function toMs(value: string | Date) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}
