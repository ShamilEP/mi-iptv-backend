import {
  REALTIME_MAX_CONNECTIONS_PER_ACCOUNT,
  REALTIME_MAX_CONNECTIONS_PER_DEVICE,
} from '../../domain/realtime/realtime-limits.js';
import { DomainError } from '../../domain/shared/domain-error.js';

export type RealtimeConnectionRef = {
  readonly connectionId: string;
  readonly accountId: string;
  readonly deviceId: string;
  readonly sessionId: string;
};

/**
 * In-process connection accounting for limits (BE-077).
 */
export class RealtimeConnectionRegistry {
  private readonly byConnection = new Map<string, RealtimeConnectionRef>();
  private readonly byDevice = new Map<string, Set<string>>();
  private readonly byAccount = new Map<string, number>();

  constructor(
    private readonly maxPerDevice = REALTIME_MAX_CONNECTIONS_PER_DEVICE,
    private readonly maxPerAccount = REALTIME_MAX_CONNECTIONS_PER_ACCOUNT,
  ) {}

  assertCanAccept(accountId: string, deviceId: string): void {
    const deviceCount = this.byDevice.get(deviceKey(accountId, deviceId))?.size ?? 0;
    if (deviceCount >= this.maxPerDevice) {
      throw new DomainError(
        'Too many realtime connections for this device',
        'REALTIME_DEVICE_CONNECTION_LIMIT',
      );
    }
    const accountCount = this.byAccount.get(accountId) ?? 0;
    if (accountCount >= this.maxPerAccount) {
      throw new DomainError(
        'Too many realtime connections for this account',
        'REALTIME_ACCOUNT_CONNECTION_LIMIT',
      );
    }
  }

  register(ref: RealtimeConnectionRef): void {
    this.assertCanAccept(ref.accountId, ref.deviceId);
    this.byConnection.set(ref.connectionId, ref);
    const dKey = deviceKey(ref.accountId, ref.deviceId);
    const set = this.byDevice.get(dKey) ?? new Set<string>();
    set.add(ref.connectionId);
    this.byDevice.set(dKey, set);
    this.byAccount.set(ref.accountId, (this.byAccount.get(ref.accountId) ?? 0) + 1);
  }

  unregister(connectionId: string): RealtimeConnectionRef | null {
    const ref = this.byConnection.get(connectionId);
    if (!ref) {
      return null;
    }
    this.byConnection.delete(connectionId);
    const dKey = deviceKey(ref.accountId, ref.deviceId);
    const set = this.byDevice.get(dKey);
    if (set) {
      set.delete(connectionId);
      if (set.size === 0) {
        this.byDevice.delete(dKey);
      }
    }
    const next = (this.byAccount.get(ref.accountId) ?? 1) - 1;
    if (next <= 0) {
      this.byAccount.delete(ref.accountId);
    } else {
      this.byAccount.set(ref.accountId, next);
    }
    return ref;
  }

  countForDevice(accountId: string, deviceId: string): number {
    return this.byDevice.get(deviceKey(accountId, deviceId))?.size ?? 0;
  }

  countForAccount(accountId: string): number {
    return this.byAccount.get(accountId) ?? 0;
  }
}

function deviceKey(accountId: string, deviceId: string): string {
  return `${accountId}:${deviceId}`;
}
