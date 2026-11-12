import http from 'node:http';
import https from 'node:https';
import { SsrfGuardError } from '../../domain/sources/ssrf-guard-error.js';
import type {
  SourceHttpClient,
  SourceHttpRequest,
  SourceHttpResponse,
} from '../../application/ports/source-http-client.js';

/**
 * Single-hop HTTP(S) client that connects to a pre-resolved address
 * (DNS rebinding mitigation) and never follows redirects.
 */
export class NodeSourceHttpClient implements SourceHttpClient {
  async request(input: SourceHttpRequest): Promise<SourceHttpResponse> {
    const url = new URL(input.url);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    const port = url.port.length > 0 ? Number(url.port) : isHttps ? 443 : 80;

    return await new Promise<SourceHttpResponse>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let settled = false;

      const fail = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        reject(error);
      };

      const requestOptions: https.RequestOptions = {
        protocol: url.protocol,
        hostname: input.resolvedAddress,
        port,
        path: `${url.pathname}${url.search}`,
        method: input.method ?? 'GET',
        headers: {
          Host: hostHeader(input.hostname, url.port, isHttps),
          Accept: '*/*',
          Connection: 'close',
        },
        timeout: input.timeoutMs,
      };
      if (isHttps) {
        requestOptions.servername = input.hostname;
      }

      const req = transport.request(requestOptions, (res) => {
        res.on('data', (chunk: Buffer) => {
          totalBytes += chunk.byteLength;
          if (totalBytes > input.maxResponseBytes) {
            req.destroy();
            fail(
              new SsrfGuardError(
                `Source HTTP response exceeded ${input.maxResponseBytes} bytes`,
                'SOURCE_HTTP_RESPONSE_TOO_LARGE',
              ),
            );
            return;
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          if (settled) {
            return;
          }
          settled = true;
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: normalizeHeaders(res.headers),
            body: Buffer.concat(chunks),
          });
        });

        res.on('error', (error: Error) => {
          fail(
            new SsrfGuardError(
              `Source HTTP response failed: ${error.message}`,
              'SOURCE_HTTP_FAILED',
            ),
          );
        });
      });

      req.on('timeout', () => {
        req.destroy();
        fail(
          new SsrfGuardError(
            'Source HTTP request timed out',
            'SOURCE_HTTP_TIMEOUT',
          ),
        );
      });

      req.on('error', (error: Error) => {
        fail(
          new SsrfGuardError(
            `Source HTTP request failed: ${error.message}`,
            'SOURCE_HTTP_FAILED',
          ),
        );
      });

      req.end();
    });
  }
}

function hostHeader(hostname: string, port: string, isHttps: boolean): string {
  const needsBrackets = hostname.includes(':');
  const host = needsBrackets ? `[${hostname}]` : hostname;
  if (port.length === 0) {
    return host;
  }
  const defaultPort = isHttps ? '443' : '80';
  if (port === defaultPort) {
    return host;
  }
  return `${host}:${port}`;
}

function normalizeHeaders(
  headers: http.IncomingHttpHeaders,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    normalized[key.toLowerCase()] = Array.isArray(value)
      ? value.join(', ')
      : value;
  }
  return normalized;
}
