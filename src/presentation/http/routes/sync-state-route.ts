import type { AccountSyncClock } from '../../../application/ports/account-sync-clock.js';
import type {
  HttpRequest,
  HttpResponse,
  HttpRoute,
} from '../../../application/ports/http-server.js';
import { GetSyncState } from '../../../application/sync/get-sync-state.js';
import { buildErrorEnvelope } from '../../../domain/api/error-envelope.js';
import { DomainError } from '../../../domain/shared/domain-error.js';
import {
  SYNC_JSON_HEADERS,
  requireSyncHeader,
} from './sync-route-helpers.js';

export function createSyncStateRoute(deps: {
  readonly getSyncState: GetSyncState;
  readonly syncClock: AccountSyncClock;
}): HttpRoute {
  return {
    method: 'GET',
    path: '/api/v1/sync/state',
    handler: (request) =>
      handleGetSyncState(request, deps.getSyncState, deps.syncClock),
  };
}

async function handleGetSyncState(
  request: HttpRequest,
  getSyncState: GetSyncState,
  syncClock: AccountSyncClock,
): Promise<HttpResponse> {
  const accountId = requireSyncHeader(request, 'x-account-id', 'account');
  if (typeof accountId !== 'string') {
    return accountId;
  }

  try {
    const page = await getSyncState.execute({
      accountId,
      cursor: request.query?.cursor,
      since: request.query?.since,
      limit: request.query?.limit,
    });
    return {
      statusCode: 200,
      headers: SYNC_JSON_HEADERS,
      body: page,
    };
  } catch (error: unknown) {
    if (
      error instanceof DomainError &&
      error.code === 'SYNC_FULL_RESYNC_REQUIRED'
    ) {
      const tombstoneFloor = await syncClock.getTombstoneFloor(accountId);
      return {
        statusCode: 409,
        headers: SYNC_JSON_HEADERS,
        body: {
          code: 'SYNC_FULL_RESYNC_REQUIRED',
          tombstoneFloor,
          message: error.message,
        },
      };
    }
    if (error instanceof DomainError) {
      return {
        statusCode: 400,
        headers: SYNC_JSON_HEADERS,
        body: buildErrorEnvelope({
          error: error.message,
          code: error.code,
        }),
      };
    }
    throw error;
  }
}
