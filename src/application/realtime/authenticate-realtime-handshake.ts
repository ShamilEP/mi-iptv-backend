import { DomainError } from '../../domain/shared/domain-error.js';
import type { AccessTokenClaims } from '../../domain/auth/access-token-claims.js';
import type { AssertAccessTokenActive } from '../auth/assert-access-token-active.js';

export type RealtimeHandshakeInput = {
  readonly accessToken: string;
  readonly deviceId: string;
};

/**
 * JWT + device binding for WSS `/realtime` (BE-077 / SEC STRIDE R-01).
 */
export class AuthenticateRealtimeHandshake {
  constructor(private readonly assertAccessTokenActive: AssertAccessTokenActive) {}

  async execute(input: RealtimeHandshakeInput): Promise<AccessTokenClaims> {
    const deviceId = input.deviceId.trim();
    if (deviceId === '') {
      throw new DomainError('deviceId is required', 'REALTIME_DEVICE_REQUIRED');
    }
    const claims = await this.assertAccessTokenActive.execute(input.accessToken);
    if (claims.deviceId !== deviceId) {
      throw new DomainError(
        'Access token deviceId does not match handshake deviceId',
        'REALTIME_DEVICE_MISMATCH',
      );
    }
    return claims;
  }
}
