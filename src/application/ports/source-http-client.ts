/**
 * Single-hop outbound HTTP for IPTV source fetches.
 * Implementations must not follow redirects; callers re-validate each hop.
 */
export type SourceHttpRequest = {
  readonly url: string;
  readonly hostname: string;
  readonly resolvedAddress: string;
  readonly method?: 'GET' | 'HEAD';
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
};

export type SourceHttpResponse = {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
};

export interface SourceHttpClient {
  request(input: SourceHttpRequest): Promise<SourceHttpResponse>;
}
