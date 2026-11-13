import { DomainError } from '../shared/domain-error.js';

export type SyncErrorCode =
  | 'CLIENT_EVENT_ID_INVALID'
  | 'SYNC_VERSION_INVALID'
  | 'PLAYBACK_POSITION_INVALID'
  | 'PLAYBACK_DURATION_INVALID';

export class SyncError extends DomainError {
  constructor(
    message: string,
    override readonly code: SyncErrorCode,
  ) {
    super(message, code);
    this.name = 'SyncError';
  }
}
