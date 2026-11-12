import { XtreamError } from './xtream-error.js';

export type XtreamAccountStatus = 'active' | 'expired' | 'blocked' | 'disabled';

export type XtreamUserInfo = {
  readonly auth: number | boolean | string | null | undefined;
  readonly status: string | null | undefined;
  readonly expDate: string | number | null | undefined;
};

/**
 * Interprets Xtream `user_info` auth/status/exp_date into a hard failure or active.
 */
export function assertXtreamAccountUsable(userInfo: XtreamUserInfo): void {
  if (!isAuthenticated(userInfo.auth)) {
    throw new XtreamError('Xtream authentication failed', 'XTREAM_AUTH_FAILED');
  }

  const status = normalizeStatus(userInfo.status);
  if (status === 'expired') {
    throw new XtreamError(
      'Xtream account is expired',
      'XTREAM_ACCOUNT_EXPIRED',
    );
  }
  if (status === 'blocked' || status === 'disabled') {
    throw new XtreamError(
      'Xtream account is blocked or disabled',
      'XTREAM_ACCOUNT_BLOCKED',
    );
  }

  if (isPastExpiry(userInfo.expDate)) {
    throw new XtreamError(
      'Xtream account is expired',
      'XTREAM_ACCOUNT_EXPIRED',
    );
  }
}

export function classifyXtreamAccountStatus(
  userInfo: XtreamUserInfo,
): XtreamAccountStatus {
  if (!isAuthenticated(userInfo.auth)) {
    return 'disabled';
  }
  const status = normalizeStatus(userInfo.status);
  if (status === 'expired' || isPastExpiry(userInfo.expDate)) {
    return 'expired';
  }
  if (status === 'blocked') {
    return 'blocked';
  }
  if (status === 'disabled') {
    return 'disabled';
  }
  return 'active';
}

function isAuthenticated(auth: XtreamUserInfo['auth']): boolean {
  if (auth === true || auth === 1 || auth === '1') {
    return true;
  }
  return false;
}

function normalizeStatus(
  status: string | null | undefined,
): XtreamAccountStatus | 'active' | 'unknown' {
  if (status === null || status === undefined) {
    return 'unknown';
  }
  const normalized = status.trim().toLowerCase();
  if (normalized === 'active') {
    return 'active';
  }
  if (normalized === 'expired') {
    return 'expired';
  }
  if (normalized === 'banned' || normalized === 'blocked') {
    return 'blocked';
  }
  if (normalized === 'disabled') {
    return 'disabled';
  }
  return 'unknown';
}

function isPastExpiry(expDate: string | number | null | undefined): boolean {
  if (expDate === null || expDate === undefined || expDate === '') {
    return false;
  }
  const seconds =
    typeof expDate === 'number'
      ? expDate
      : Number.parseInt(String(expDate), 10);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return false;
  }
  // Xtream commonly uses unix seconds; treat large values as seconds.
  const expiryMs = seconds > 1_000_000_000_000 ? seconds : seconds * 1000;
  return expiryMs <= Date.now();
}
