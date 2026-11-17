import type { DnsResolver } from '../../src/application/ports/dns-resolver.js';
import { isIpLiteral } from '../../src/domain/sources/blocked-network-address.js';

/**
 * Test DNS that resolves any hostname to a public address unless overridden.
 * Used so CreateSource/UpdateSource SSRF checks do not hit the network.
 */
export class AllowingDns implements DnsResolver {
  constructor(
    private readonly overrides: Readonly<Record<string, readonly string[]>> = {},
  ) {}

  async resolveAll(hostname: string): Promise<readonly string[]> {
    const override = this.overrides[hostname];
    if (override !== undefined) {
      return override;
    }
    if (isIpLiteral(hostname)) {
      return [hostname];
    }
    return ['93.184.216.34'];
  }
}
