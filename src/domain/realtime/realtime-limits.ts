/**
 * Realtime gateway connection / presence knobs (BE-077 / ADR-007 / INF-022).
 */

/** Redis `presence:{deviceId}` TTL — heartbeat must refresh within this window. */
export const REALTIME_PRESENCE_TTL_SECONDS = 45;

/** Allow a brief overlap while a client reconnects. */
export const REALTIME_MAX_CONNECTIONS_PER_DEVICE = 2;

/** Soft cap across an account’s devices (DoS / fan-out). */
export const REALTIME_MAX_CONNECTIONS_PER_ACCOUNT = 20;

/** Resume token lifetime after disconnect. */
export const REALTIME_RESUME_TTL_SECONDS = 300;
