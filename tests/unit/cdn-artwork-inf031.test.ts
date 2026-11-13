import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('INF-031 CDN artwork cache and thumbnails', () => {
  const moduleMain = read('infra/terraform/modules/cdn_artwork/main.tf');
  const design = read('docs/infra/031-cdn-artwork.md');
  const variants = JSON.parse(
    read('docs/infra/artwork-thumbnail-variants.json'),
  ) as {
    maxLongestEdgePx: number;
    variants: Array<{ name: string; maxWidth: number; maxHeight: number }>;
    strategy: string;
  };

  it('defines CloudFront cache policies for artwork paths', () => {
    assert.match(moduleMain, /aws_cloudfront_cache_policy" "artwork"/);
    assert.match(moduleMain, /path_pattern\s*=\s*local\.artwork_path_pattern/);
    assert.match(moduleMain, /enable_accept_encoding_brotli\s*=\s*true/);
    assert.match(moduleMain, /viewer_protocol_policy\s*=\s*"redirect-to-https"/);
    assert.match(moduleMain, /origin_access_control/);
    assert.match(design, /Cache policies/i);
  });

  it('documents a TV-safe thumbnail / resizing strategy', () => {
    assert.equal(variants.strategy, 'pre-generated-variants');
    assert.equal(variants.maxLongestEdgePx, 1920);
    const names = variants.variants.map((v) => v.name);
    assert.deepEqual(names, ['thumb', 'poster', 'banner']);
    for (const variant of variants.variants) {
      assert.ok(variant.maxWidth <= 1920);
      assert.ok(variant.maxHeight <= 1920);
    }
    assert.match(design, /Thumbnail \/ resizing strategy/i);
    assert.match(design, /must not\*\* download full-resolution|must not.*full-resolution/i);
    assert.match(moduleMain, /ThumbnailStrategy\s*=\s*"pre-generated-variants"/);
  });

  it('wires the CDN module into env roots', () => {
    for (const env of ['dev', 'qa', 'prod']) {
      const main = read(`infra/terraform/environments/${env}/main.tf`);
      assert.match(main, /module\s+"cdn_artwork"/);
      assert.match(main, /source\s*=\s*"\.\.\/\.\.\/modules\/cdn_artwork"/);
    }
  });
});
