import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import type { DnsResolver } from '../../application/ports/dns-resolver.js';

/**
 * Node `dns.lookup` adapter — returns all A/AAAA results for SSRF re-checks.
 */
export class NodeDnsResolver implements DnsResolver {
  async resolveAll(hostname: string): Promise<readonly string[]> {
    if (isIP(hostname)) {
      return [hostname];
    }

    const results = await dns.lookup(hostname, { all: true, verbatim: true });
    const addresses = results.map((entry) => entry.address);
    return [...new Set(addresses)];
  }
}
