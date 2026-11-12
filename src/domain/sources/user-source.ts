export type SourceKind = 'm3u' | 'xtream' | 'proprietary';

export type SourceStatus = 'pending' | 'ok' | 'degraded' | 'error';

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
  readonly syncVersion: number;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export function isMutableSourceKind(kind: string): kind is 'm3u' | 'xtream' {
  return kind === 'm3u' || kind === 'xtream';
}
