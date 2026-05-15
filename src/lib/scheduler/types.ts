export type RejectionReason = "no feasible window" | "would violate cap";

export interface SchedulerConfig {
  bucketMinutes: number;
  capacity: number;
  horizonDays: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
}

export interface PendingRequest {
  id: string;
  userId: string;
  durationMin: number;
  windowStart: string | Date;
  windowEnd: string | Date;
  rigid: boolean;
  createdAt: string | Date;
  fairnessScore: number;
}

export interface ConfirmedSession {
  id: string;
  requestId: string;
  userId: string;
  startAt: string | Date;
  endAt: string | Date;
}

export interface SchedulerAssignment {
  requestId: string;
  userId: string;
  startAt: string;
  endAt: string;
}

export interface SchedulerRejection {
  requestId: string;
  userId: string;
  reason: RejectionReason;
}

export interface SchedulerMetrics {
  requestsSeen: number;
  placed: number;
  rejected: number;
  peakUtilization: number;
  assignedMinutes: number;
}

export interface SchedulerResult {
  assignments: SchedulerAssignment[];
  rejections: SchedulerRejection[];
  metrics: SchedulerMetrics;
}

export const defaultSchedulerConfig: SchedulerConfig = {
  bucketMinutes: 5,
  capacity: 100,
  horizonDays: 14,
  minDurationMinutes: 5,
  maxDurationMinutes: 480
};
