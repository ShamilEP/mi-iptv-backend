import { maskSourceSecretsForApi } from './mask-source-secrets-for-api.js';
import type { UserSource } from '../../domain/sources/user-source.js';

export type SourcePublicView = {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly uriRef: string | null;
  readonly priority: number;
  readonly enabled: boolean;
  readonly status: string;
  readonly statusReason: string | null;
  readonly syncVersion: number;
  readonly credentialsConfigured: boolean;
  readonly username: null;
  readonly password: null;
  readonly token: null;
};

export function toSourcePublicView(source: UserSource): SourcePublicView {
  const masked = maskSourceSecretsForApi({
    credentialsConfigured: source.credentialsEncrypted !== null,
  });
  return {
    id: source.id,
    kind: source.kind,
    name: source.name,
    uriRef: source.uriRef,
    priority: source.priority,
    enabled: source.enabled,
    status: source.status,
    statusReason: source.statusReason,
    syncVersion: source.syncVersion,
    ...masked,
  };
}
