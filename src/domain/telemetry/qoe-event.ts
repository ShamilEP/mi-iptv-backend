/**
 * Normalized QoE sample for FR-029 / BE-090.
 * Never includes accountId, email, or push tokens (SEC-040).
 */
export type QoeEventRecord = {
  readonly anonymousSessionId: string;
  readonly sourceProvider: string;
  readonly timeToFirstFrameMs: number | null;
  readonly rebufferEventsCount: number | null;
  readonly rebufferDurationMs: number | null;
  readonly streamErrorsCount: number | null;
  readonly appVersion: string | null;
  readonly deviceModel: string | null;
  readonly receivedAt: Date;
};
