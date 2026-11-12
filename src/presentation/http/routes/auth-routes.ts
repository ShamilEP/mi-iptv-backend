import type { LoginAccount } from '../../../application/auth/login-account.js';
import type {
  HttpRequest,
  HttpResponse,
  HttpRoute,
} from '../../../application/ports/http-server.js';
import { DomainError } from '../../../domain/shared/domain-error.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
} as const;

export function createAuthRoutes(deps: {
  readonly loginAccount: LoginAccount;
}): readonly HttpRoute[] {
  return [
    {
      method: 'POST',
      path: '/api/v1/auth/login',
      handler: (request) => handleLogin(request, deps.loginAccount),
    },
  ];
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

function asObject(body: unknown): Record<string, unknown> | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  return body as Record<string, unknown>;
}

function mapDomainError(error: unknown): HttpResponse {
  if (error instanceof DomainError) {
    const statusCode =
      error.code === 'AUTH_INVALID'
        ? 401
        : error.code === 'AUTH_ACCOUNT_INACTIVE'
          ? 403
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
