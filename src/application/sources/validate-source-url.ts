import {
  isBlockedNetworkAddress,
  isIpLiteral,
} from '../../domain/sources/blocked-network-address.js';
import { SsrfGuardError } from '../../domain/sources/ssrf-guard-error.js';
import {
  parseSourceUrl,
  type ParsedSourceUrl,
} from '../../domain/sources/source-url.js';
import type { DnsResolver } from '../ports/dns-resolver.js';

export type ValidatedSourceUrlTarget = {
  readonly url: ParsedSourceUrl;
  readonly resolvedAddresses: readonly string[];
  readonly connectAddress: string;
};

/**
 * Validates a source URL (http/https only) and re-checks after DNS resolution
 * that no target address is private, loopback, link-local, or metadata.
 */
export class ValidateSourceUrl {
  constructor(private readonly dns: DnsResolver) {}

  async execute(rawUrl: string): Promise<ValidatedSourceUrlTarget> {
    const url = parseSourceUrl(rawUrl);
    return this.validateParsed(url);
  }

  async validateParsed(
    url: ParsedSourceUrl,
  ): Promise<ValidatedSourceUrlTarget> {
    if (isIpLiteral(url.hostname) && isBlockedNetworkAddress(url.hostname)) {
      throw new SsrfGuardError(
        'Source URL targets a blocked address',
        'SOURCE_URL_ADDRESS_BLOCKED',
      );
    }

    let resolvedAddresses: readonly string[];
    try {
      resolvedAddresses = await this.dns.resolveAll(url.hostname);
    } catch (error: unknown) {
      throw new SsrfGuardError(
        error instanceof Error
          ? `Source URL DNS lookup failed: ${error.message}`
          : 'Source URL DNS lookup failed',
        'SOURCE_URL_DNS_FAILED',
      );
    }

    if (resolvedAddresses.length === 0) {
      throw new SsrfGuardError(
        'Source URL DNS lookup returned no addresses',
        'SOURCE_URL_DNS_FAILED',
      );
    }

    for (const address of resolvedAddresses) {
      if (isBlockedNetworkAddress(address)) {
        throw new SsrfGuardError(
          'Source URL resolves to a blocked address',
          'SOURCE_URL_ADDRESS_BLOCKED',
        );
      }
    }

    const connectAddress = resolvedAddresses[0];
    if (connectAddress === undefined) {
      throw new SsrfGuardError(
        'Source URL DNS lookup returned no addresses',
        'SOURCE_URL_DNS_FAILED',
      );
    }

    return {
      url,
      resolvedAddresses,
      connectAddress,
    };
  }
}
