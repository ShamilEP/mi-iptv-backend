import {
  assertNonNegativeInt,
  assertQoeBatchSize,
  assertSourceProvider,
  parseAnonymousSessionId,
} from '../../domain/telemetry/qoe-batch.js';
import type { QoeEventRecord } from '../../domain/telemetry/qoe-event.js';
import type { QoeEventRepository } from '../ports/qoe-event-repository.js';

export type IngestQoeEventInput = {
  readonly sourceProvider: string;
  readonly timeToFirstFrameMs?: number;
  readonly rebufferEventsCount?: number;
  readonly rebufferDurationMs?: number;
  readonly streamErrorsCount?: number;
};

export type IngestQoeEventsInput = {
  readonly anonymousSessionId: string;
  readonly telemetryOptIn?: boolean;
  readonly appVersion?: string | null;
  readonly deviceModel?: string | null;
  readonly events: readonly IngestQoeEventInput[];
};

export type IngestQoeEventsResult = {
  readonly accepted: number;
  readonly skippedOptOut?: true;
};

/**
 * POST /api/v1/diagnostics/qoe — anonymous QoE batch ingest (BE-090 / FR-029).
 * Honors telemetry opt-out; never persists account ids.
 */
export class IngestQoeEvents {
  constructor(private readonly repository: QoeEventRepository) {}

  async execute(input: IngestQoeEventsInput): Promise<IngestQoeEventsResult> {
    if (input.telemetryOptIn === false) {
      return { accepted: 0, skippedOptOut: true };
    }

    assertQoeBatchSize(input.events.length);
    const anonymousSessionId = parseAnonymousSessionId(
      input.anonymousSessionId,
    );
    const appVersion = normalizeOptionalText(input.appVersion);
    const deviceModel = normalizeOptionalText(input.deviceModel);
    const receivedAt = new Date();

    const records: QoeEventRecord[] = input.events.map((event) => ({
      anonymousSessionId,
      sourceProvider: assertSourceProvider(event.sourceProvider),
      timeToFirstFrameMs:
        assertNonNegativeInt(event.timeToFirstFrameMs, 'timeToFirstFrameMs') ??
        null,
      rebufferEventsCount:
        assertNonNegativeInt(
          event.rebufferEventsCount,
          'rebufferEventsCount',
        ) ?? null,
      rebufferDurationMs:
        assertNonNegativeInt(
          event.rebufferDurationMs,
          'rebufferDurationMs',
        ) ?? null,
      streamErrorsCount:
        assertNonNegativeInt(
          event.streamErrorsCount,
          'streamErrorsCount',
        ) ?? null,
      appVersion,
      deviceModel,
      receivedAt,
    }));

    const accepted = await this.repository.insertMany(records);
    return { accepted };
  }
}

function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 128) : null;
}
