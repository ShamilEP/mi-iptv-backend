import { AuthRateLimitError } from '../../../application/auth/auth-rate-limit-error.js';
import type { LoginAccount } from '../../../application/auth/login-account.js';
import type { LogoutAccount } from '../../../application/auth/logout-account.js';
import type { RefreshAuthSession } from '../../../application/auth/refresh-auth-session.js';
import type { RegisterAccount } from '../../../application/auth/register-account.js';
import type {
  HttpRequest,
  HttpResponse,
  HttpRoute,
} from '../../../application/ports/http-server.js';
import { DomainError } from '../../../domain/shared/domain-error.js';
import { PasswordPolicyError } from '../../../domain/auth/password-policy.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
} as const;

const UNAUTHORIZED_CODES = new Set([
  'AUTH_REFRESH_INVALID',
  'AUTH_REFRESH_REVOKED',
  'AUTH_REFRESH_EXPIRED',
  'AUTH_REFRESH_REUSE',
  'AUTH_INVALID',
  'AUTH_ACCESS_INVALID',
  'AUTH_ACCESS_REVOKED',
]);

export function createAuthRoutes(deps: {
  readonly registerAccount: RegisterAccount;
  readonly loginAccount: LoginAccount;
  readonly refreshAuthSession: RefreshAuthSession;
  readonly logoutAccount: LogoutAccount;
}): readonly HttpRoute[] {
  return [
    {
      method: 'POST',
      path: '/api/v1/auth/register',
      handler: (request) => handleRegister(request, deps.registerAccount),
    },
    {
      method: 'POST',
      path: '/api/v1/auth/login',
      handler: (request) => handleLogin(request, deps.loginAccount),
    },
    {
      method: 'POST',
      path: '/api/v1/auth/refresh',
      handler: (request) => handleRefresh(request, deps.refreshAuthSession),
    },
    {
      method: 'POST',
      path: '/api/v1/auth/logout',
      handler: (request) => handleLogout(request, deps.logoutAccount),
    },
  ];
}

async function handleRegister(
  request: HttpRequest,
  registerAccount: RegisterAccount,
): Promise<HttpResponse> {
  const body = asObject(request.body);
  if (!body) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: { error: 'JSON object body required', code: 'AUTH_INPUT_INVALID' },
    };
  }

  try {
    const result = await registerAccount.execute({
      email: String(body.email ?? ''),
      password: String(body.password ?? ''),
      deviceId: String(body.deviceId ?? ''),
    });
    return {
      statusCode: 201,
      headers: JSON_HEADERS,
      body: {
        accountId: result.accountId,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      },
    };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

async function handleLogin(
  request: HttpRequest,
  loginAccount: LoginAccount,
): Promise<HttpResponse> {
  const body = asObject(request.body);
  if (!body) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: { error: 'JSON object body required', code: 'AUTH_INPUT_INVALID' },
    };
  }

  try {
    const result = await loginAccount.execute({
      email: String(body.email ?? ''),
      password: String(body.password ?? ''),
      deviceId: String(body.deviceId ?? ''),
      clientIp: request.clientIp ?? 'unknown',
    });
    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: {
        accountId: result.accountId,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      },
    };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

async function handleRefresh(
  request: HttpRequest,
  refreshAuthSession: RefreshAuthSession,
): Promise<HttpResponse> {
  const body = asObject(request.body);
  if (!body) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: { error: 'JSON object body required', code: 'AUTH_INPUT_INVALID' },
    };
  }

  try {
    const result = await refreshAuthSession.execute({
      refreshToken: String(body.refreshToken ?? ''),
    });
    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: {
        accountId: result.accountId,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      },
    };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

async function handleLogout(
  request: HttpRequest,
  logoutAccount: LogoutAccount,
): Promise<HttpResponse> {
  const accessToken = readBearerToken(request) ?? readBodyAccessToken(request);
  if (accessToken === null) {
    return {
      statusCode: 401,
      headers: JSON_HEADERS,
      body: {
        error: 'Bearer access token required',
        code: 'AUTH_ACCESS_INVALID',
      },
    };
  }

  const body = asObject(request.body) ?? {};
  const allSessions =
    body.allSessions === true || body.allDevices === true;

  try {
    const result = await logoutAccount.execute({
      accessToken,
      allSessions,
    });
    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: {
        status: result.status,
        scope: result.scope,
      },
    };
  } catch (error: unknown) {
    return mapDomainError(error);
  }
}

function readBearerToken(request: HttpRequest): string | null {
  const raw =
    request.headers['authorization'] ?? request.headers['Authorization'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  if (!match || match[1] === undefined || match[1].trim() === '') {
    return null;
  }
  return match[1].trim();
}

function readBodyAccessToken(request: HttpRequest): string | null {
  const body = asObject(request.body);
  if (!body) {
    return null;
  }
  const token = body.accessToken;
  return typeof token === 'string' && token.trim() !== ''
    ? token.trim()
    : null;
}

function asObject(body: unknown): Record<string, unknown> | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  return body as Record<string, unknown>;
}

function mapDomainError(error: unknown): HttpResponse {
  if (error instanceof AuthRateLimitError) {
    const retryAfter = Math.max(1, Math.floor(error.retryAfterSeconds));
    return {
      statusCode: 429,
      headers: {
        ...JSON_HEADERS,
        'retry-after': String(retryAfter),
      },
      body: {
        error: error.message,
        code: error.code,
        retryAfter,
      },
    };
  }
  if (error instanceof PasswordPolicyError || error instanceof DomainError) {
    const statusCode =
      error.code === 'AUTH_EMAIL_CONFLICT'
        ? 409
        : error.code === 'AUTH_ACCOUNT_INACTIVE'
          ? 403
          : UNAUTHORIZED_CODES.has(error.code)
            ? 401
            : 400;
    return {
      statusCode,
      headers: JSON_HEADERS,
      body: { error: error.message, code: error.code },
    };
  }
  return {
    statusCode: 500,
    headers: JSON_HEADERS,
    body: { error: 'Internal server error', code: 'INTERNAL' },
  };
}
