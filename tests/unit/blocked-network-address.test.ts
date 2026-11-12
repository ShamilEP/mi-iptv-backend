import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isBlockedMetadataHostname,
  isBlockedNetworkAddress,
} from '../../src/domain/sources/blocked-network-address.js';

describe('isBlockedNetworkAddress', () => {
  it('rejects loopback, private, link-local, and metadata IPv4', () => {
    assert.equal(isBlockedNetworkAddress('127.0.0.1'), true);
    assert.equal(isBlockedNetworkAddress('10.0.0.5'), true);
    assert.equal(isBlockedNetworkAddress('172.16.1.1'), true);
    assert.equal(isBlockedNetworkAddress('192.168.1.10'), true);
    assert.equal(isBlockedNetworkAddress('169.254.169.254'), true);
    assert.equal(isBlockedNetworkAddress('100.64.1.1'), true);
  });

  it('rejects loopback, ULA, link-local, and AWS IMDS IPv6', () => {
    assert.equal(isBlockedNetworkAddress('::1'), true);
    assert.equal(isBlockedNetworkAddress('fc00::1'), true);
    assert.equal(isBlockedNetworkAddress('fe80::1'), true);
    assert.equal(isBlockedNetworkAddress('fd00:ec2::254'), true);
  });

  it('rejects IPv4-mapped loopback', () => {
    assert.equal(isBlockedNetworkAddress('::ffff:127.0.0.1'), true);
    assert.equal(isBlockedNetworkAddress('::ffff:192.168.0.1'), true);
  });

  it('allows public addresses', () => {
    assert.equal(isBlockedNetworkAddress('8.8.8.8'), false);
    assert.equal(isBlockedNetworkAddress('1.1.1.1'), false);
    assert.equal(isBlockedNetworkAddress('2001:4860:4860::8888'), false);
  });
});

describe('isBlockedMetadataHostname', () => {
  it('blocks cloud metadata and localhost names', () => {
    assert.equal(isBlockedMetadataHostname('metadata.google.internal'), true);
    assert.equal(isBlockedMetadataHostname('localhost'), true);
    assert.equal(isBlockedMetadataHostname('foo.localhost'), true);
    assert.equal(isBlockedMetadataHostname('cdn.example.com'), false);
  });
});
