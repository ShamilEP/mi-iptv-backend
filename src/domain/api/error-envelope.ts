/**
 * Canonical JSON error body for `/api/v1` (BE-005 / ADR-011).
 * Never put passwords, refresh tokens, or source credentials in `details`.
 */
export type ErrorEnvelope = {
  readonly error: string;
  readonly code: string;
  readonly traceId?: string;
  readonly details?: Readonly<Record<string, unknown>>;
};

export type BuildErrorEnvelopeInput = {
  readonly error: string;
  readonly code: string;
  readonly traceId?: string;
  readonly details?: Readonly<Record<string, unknown>>;
};

export function buildErrorEnvelope(
  input: BuildErrorEnvelopeInput,
): ErrorEnvelope {
  const envelope: {
    error: string;
    code: string;
    traceId?: string;
    details?: Readonly<Record<string, unknown>>;
  } = {
    error: input.error,
    code: input.code,
  };
  if (input.traceId !== undefined && input.traceId.trim() !== '') {
    envelope.traceId = input.traceId.trim();
  }
  if (input.details !== undefined) {
    envelope.details = input.details;
  }
  return envelope;
}
