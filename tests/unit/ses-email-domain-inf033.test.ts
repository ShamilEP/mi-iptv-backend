import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('INF-033 transactional email domain (SPF/DKIM/DMARC)', () => {
  const moduleMain = read('infra/terraform/modules/ses_email_domain/main.tf');
  const design = read('docs/infra/033-transactional-email-domain.md');

  it('configures SES domain identity with Easy DKIM DNS records', () => {
    assert.match(moduleMain, /aws_ses_domain_identity" "mail"/);
    assert.match(moduleMain, /aws_ses_domain_dkim" "mail"/);
    assert.match(moduleMain, /aws_route53_record" "ses_dkim"/);
    assert.match(moduleMain, /dkim\.amazonses\.com/);
    assert.match(design, /DKIM/i);
  });

  it('publishes SPF authorizing Amazon SES', () => {
    assert.match(moduleMain, /aws_route53_record" "spf"/);
    assert.match(
      moduleMain,
      /v=spf1 include:amazonses\.com ~all|var\.spf_record/,
    );
    const variables = read(
      'infra/terraform/modules/ses_email_domain/variables.tf',
    );
    assert.match(variables, /v=spf1 include:amazonses\.com ~all/);
    assert.match(design, /SPF/i);
  });

  it('publishes a DMARC policy for password-reset mail', () => {
    assert.match(moduleMain, /aws_route53_record" "dmarc"/);
    assert.match(moduleMain, /_dmarc\.\$\{var\.mail_domain\}/);
    assert.match(moduleMain, /v=DMARC1/);
    assert.match(design, /DMARC/i);
    assert.match(design, /password-reset/i);
  });

  it('wires the SES email module into env roots', () => {
    for (const env of ['dev', 'qa', 'prod']) {
      const main = read(`infra/terraform/environments/${env}/main.tf`);
      assert.match(main, /module\s+"ses_email_domain"/);
      assert.match(main, /source\s*=\s*"\.\.\/\.\.\/modules\/ses_email_domain"/);
      assert.match(main, /zone_id\s*=\s*module\.dns_acm\.zone_id/);
    }
  });
});
