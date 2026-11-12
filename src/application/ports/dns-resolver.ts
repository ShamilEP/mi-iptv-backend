/**
 * Resolves hostnames to IP addresses for SSRF re-checks after DNS.
 */
export interface DnsResolver {
  resolveAll(hostname: string): Promise<readonly string[]>;
}
