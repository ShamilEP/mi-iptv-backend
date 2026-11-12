/**
 * Classifies resolved addresses that must not be contacted when fetching
 * user-supplied IPTV source URLs (SSRF guard — Security §4.2 / BE-041).
 */

const BLOCKED_METADATA_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.goog',
]);

type V4Cidr = { readonly base: number; readonly mask: number };
type V6Cidr = { readonly base: bigint; readonly mask: bigint };

const V4_BLOCKED: readonly V4Cidr[] = [
  cidrV4('0.0.0.0', 8), // "this" network
  cidrV4('10.0.0.0', 8), // private
  cidrV4('100.64.0.0', 10), // shared/CGNAT
  cidrV4('127.0.0.0', 8), // loopback
  cidrV4('169.254.0.0', 16), // link-local + cloud metadata
  cidrV4('172.16.0.0', 12), // private
  cidrV4('192.168.0.0', 16), // private
  cidrV4('224.0.0.0', 4), // multicast
  cidrV4('240.0.0.0', 4), // reserved
];

const V6_BLOCKED: readonly V6Cidr[] = [
  cidrV6('::', 128), // unspecified
  cidrV6('::1', 128), // loopback
  cidrV6('fc00::', 7), // unique local (private)
  cidrV6('fe80::', 10), // link-local
  cidrV6('ff00::', 8), // multicast
  cidrV6('fd00:ec2::254', 128), // AWS IMDS IPv6
];

export function isBlockedMetadataHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (BLOCKED_METADATA_HOSTNAMES.has(normalized)) {
    return true;
  }
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
    return true;
  }
  return false;
}

export function isIpLiteral(address: string): boolean {
  const trimmed = address.trim();
  return isIpv4Literal(trimmed) || isIpv6Literal(trimmed);
}

/**
 * Returns true when `address` is an IP in a blocked range.
 * Non-IP hostnames are not classified here — resolve DNS first.
 */
export function isBlockedNetworkAddress(address: string): boolean {
  const trimmed = address.trim();
  if (isIpv4Literal(trimmed)) {
    return isBlockedIpv4(ipv4ToInt(trimmed));
  }
  if (isIpv6Literal(trimmed)) {
    const mapped = extractIpv4Mapped(trimmed);
    if (mapped !== null) {
      return isBlockedIpv4(mapped);
    }
    return isBlockedIpv6(ipv6ToBigInt(trimmed));
  }
  return false;
}

function isIpv4Literal(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) {
    return false;
  }
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) {
      return false;
    }
    const octet = Number(part);
    return octet >= 0 && octet <= 255;
  });
}

function isIpv6Literal(value: string): boolean {
  if (!value.includes(':')) {
    return false;
  }
  try {
    ipv6ToBigInt(value);
    return true;
  } catch {
    return false;
  }
}

function isBlockedIpv4(value: number): boolean {
  return V4_BLOCKED.some((cidr) => (value & cidr.mask) === cidr.base);
}

function isBlockedIpv6(value: bigint): boolean {
  return V6_BLOCKED.some((cidr) => (value & cidr.mask) === cidr.base);
}

function cidrV4(base: string, prefix: number): V4Cidr {
  const mask = prefix === 0 ? 0 : (0xff_ff_ff_ff << (32 - prefix)) >>> 0;
  return { base: ipv4ToInt(base) & mask, mask };
}

function cidrV6(base: string, prefix: number): V6Cidr {
  const mask =
    prefix === 0
      ? 0n
      : (((1n << BigInt(prefix)) - 1n) << BigInt(128 - prefix)) &
        ((1n << 128n) - 1n);
  return { base: ipv6ToBigInt(base) & mask, mask };
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }
  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      throw new Error(`Invalid IPv4 address: ${ip}`);
    }
    value = ((value << 8) + octet) >>> 0;
  }
  return value;
}

function ipv6ToBigInt(ip: string): bigint {
  const normalized = expandIpv6(ip);
  const parts = normalized.split(':');
  if (parts.length !== 8) {
    throw new Error(`Invalid IPv6 address: ${ip}`);
  }
  let value = 0n;
  for (const part of parts) {
    const hextet = Number.parseInt(part, 16);
    if (!Number.isInteger(hextet) || hextet < 0 || hextet > 0xffff) {
      throw new Error(`Invalid IPv6 address: ${ip}`);
    }
    value = (value << 16n) + BigInt(hextet);
  }
  return value;
}

function expandIpv6(ip: string): string {
  const lower = replaceEmbeddedIpv4(ip.toLowerCase());
  if (!lower.includes('::')) {
    return lower
      .split(':')
      .map((p) => p.padStart(4, '0'))
      .join(':');
  }
  const [headRaw = '', tailRaw] = lower.split('::');
  const head = headRaw === '' ? [] : headRaw.split(':');
  const tail =
    tailRaw === undefined || tailRaw === '' ? [] : tailRaw.split(':');
  const missing = 8 - (head.length + tail.length);
  if (missing < 0) {
    throw new Error(`Invalid IPv6 address: ${ip}`);
  }
  const filled = [
    ...head,
    ...Array.from({ length: missing }, () => '0'),
    ...tail,
  ];
  return filled.map((p) => p.padStart(4, '0')).join(':');
}

/** Converts forms like ::ffff:127.0.0.1 into ::ffff:7f00:1. */
function replaceEmbeddedIpv4(ip: string): string {
  const lastColon = ip.lastIndexOf(':');
  if (lastColon < 0) {
    return ip;
  }
  const tail = ip.slice(lastColon + 1);
  if (!isIpv4Literal(tail)) {
    return ip;
  }
  const value = ipv4ToInt(tail);
  const hi = ((value >>> 16) & 0xffff).toString(16);
  const lo = (value & 0xffff).toString(16);
  return `${ip.slice(0, lastColon + 1)}${hi}:${lo}`;
}

function extractIpv4Mapped(ip: string): number | null {
  const expanded = expandIpv6(ip);
  const parts = expanded.split(':');
  if (parts.length !== 8) {
    return null;
  }
  const isMapped =
    parts[0] === '0000' &&
    parts[1] === '0000' &&
    parts[2] === '0000' &&
    parts[3] === '0000' &&
    parts[4] === '0000' &&
    parts[5] === 'ffff';
  if (!isMapped) {
    return null;
  }
  const hi = Number.parseInt(parts[6]!, 16);
  const lo = Number.parseInt(parts[7]!, 16);
  return ((hi << 16) + lo) >>> 0;
}
