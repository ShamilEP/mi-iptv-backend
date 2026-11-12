export type SourceKind = 'm3u' | 'xtream' | 'proprietary';

export type SourceStatus = 'pending' | 'ok' | 'degraded' | 'error';

/** Classified connectivity outcomes for `POST /sources/{id}/test` (BE-043). */
export type SourceTestReason =
  'ok' | 'unreachable' | 'auth_failed' | 'invalid_playlist' | 'timeout';

/**
 * Account-owned IPTV source registry row (Backend §5.1 `user_sources`).
 * Secrets live only as ciphertext — never cleartext on this type for API mapping.
 */
export type UserSource = {
  readonly id: string;
  readonly accountId: string;
  readonly kind: SourceKind;
  readonly name: string;
  readonly uriRef: string | null;
  readonly credentialsEncrypted: Uint8Array | null;
  readonly encKeyId: string | null;
  readonly priority: number;
  readonly enabled: boolean;
  readonly status: SourceStatus;
  /** Last connectivity classification (`status_reason`); null when healthy/pending. */
  readonly statusReason: SourceTestReason | null;
  readonly syncVersion: number;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export function isMutableSourceKind(kind: string): kind is 'm3u' | 'xtream' {
  return kind === 'm3u' || kind === 'xtream';
}
