/** Caps for SSRF-safe outbound source fetches (BE-041). */
export type SourceHttpGuardLimits = {
  readonly maxRedirects: number;
  readonly maxResponseBytes: number;
  readonly timeoutMs: number;
};

export const DEFAULT_SOURCE_HTTP_GUARD_LIMITS: SourceHttpGuardLimits = {
  maxRedirects: 3,
  maxResponseBytes: 5 * 1024 * 1024,
  timeoutMs: 15_000,
};
