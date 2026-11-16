import type { HttpRequest } from '../../../application/ports/http-server.js';

/**
 * Reads `Authorization: Bearer <token>`. Never log the returned value.
 */
export function readBearerToken(request: HttpRequest): string | null {
  const raw =
    request.headers['authorization'] ?? request.headers['Authorization'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  const token = match?.[1]?.trim();
  return token !== undefined && token.length > 0 ? token : null;
}
