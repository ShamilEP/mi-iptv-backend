import { DomainError } from '../shared/domain-error.js';

/**
 * Basic companion status wakes (SRS §9 / BE-081) when realtime socket is absent.
 */
export const COMPANION_STATUS_KINDS = [
  'connected',
  'disconnected',
  'pairing_error',
] as const;

export type CompanionStatusKind = (typeof COMPANION_STATUS_KINDS)[number];

export function isCompanionStatusKind(
  value: string,
): value is CompanionStatusKind {
  return (COMPANION_STATUS_KINDS as readonly string[]).includes(value);
}

export function assertCompanionStatusKind(
  value: string,
): CompanionStatusKind {
  if (!isCompanionStatusKind(value)) {
    throw new DomainError(
      'status must be connected, disconnected, or pairing_error',
      'COMPANION_STATUS_INVALID',
    );
  }
  return value;
}

export function companionStatusTitle(kind: CompanionStatusKind): string {
  switch (kind) {
    case 'connected':
      return 'TV connected';
    case 'disconnected':
      return 'TV disconnected';
    case 'pairing_error':
      return 'Pairing error';
  }
}

export function companionStatusBody(kind: CompanionStatusKind): string {
  switch (kind) {
    case 'connected':
      return 'Your TV is online and ready.';
    case 'disconnected':
      return 'Your TV went offline.';
    case 'pairing_error':
      return 'Device pairing failed. Try again from the companion.';
  }
}
