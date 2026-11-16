/** Public business API prefix (SRS §8 / BE-005). */
export const API_V1_PREFIX = '/api/v1';

/** Routes intentionally outside `/api/v1`. */
export const UNVERSIONED_PUBLIC_PATHS = ['/health', '/realtime'] as const;

export function isApiV1Path(pathname: string): boolean {
  return (
    pathname === API_V1_PREFIX || pathname.startsWith(`${API_V1_PREFIX}/`)
  );
}

export function isUnversionedPublicPath(pathname: string): boolean {
  return (UNVERSIONED_PUBLIC_PATHS as readonly string[]).includes(pathname);
}

/**
 * True when the path is allowed on the public HTTP surface:
 * `/api/v1...` or an explicit unversioned exception.
 */
export function isAllowedPublicApiPath(pathname: string): boolean {
  return isApiV1Path(pathname) || isUnversionedPublicPath(pathname);
}
