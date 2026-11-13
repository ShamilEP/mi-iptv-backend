# INF-033: Transactional email domain

- **Status:** Accepted (Sprint 0 **mock** Terraform — no live apply)
- **Refs:** FR-032; Infra §2.2 (DNS via INF-004); BE-027 (password-reset sender)
- **Task:** INF-033
- **Mock date:** 2026-11-13

## Goal

Configure a **transactional sending domain** with **SPF**, **DKIM**, and **DMARC** so password-reset emails authenticate and land reliably.

## Design

| Concern | Choice |
| --- | --- |
| Provider | **Amazon SES** domain identity (Easy DKIM) |
| DNS | Route 53 records in the INF-004 public zone |
| From | `noreply@{mail_domain}` (consumed later by BE-027) |
| SPF | `v=spf1 include:amazonses.com ~all` |
| DKIM | Three SES Easy DKIM CNAMEs (`*.dkim.amazonses.com`) |
| DMARC | `_dmarc` TXT, MVP policy `quarantine` (tighten to `reject` after monitoring) |

### Domains (mock root `.example`)

| Env | Mail domain | From |
| --- | --- | --- |
| `dev` | `dev.mi-iptv.example` | `noreply@dev.mi-iptv.example` |
| `qa` | `qa.mi-iptv.example` | `noreply@qa.mi-iptv.example` |
| `prod` | `mi-iptv.example` | `noreply@mi-iptv.example` |

Mail domain defaults match each env’s `dns_zone_name` so SPF/DKIM/DMARC sit on the same apex as the INF-004 zone.

### DNS records published

1. `_amazonses.{domain}` **TXT** — SES ownership verification  
2. `{token}._domainkey.{domain}` **CNAME** × 3 — Easy DKIM  
3. `{domain}` **TXT** — SPF authorizing `amazonses.com`  
4. `_dmarc.{domain}` **TXT** — DMARC with `rua=mailto:dmarc-reports@{domain}`

### Password-reset alignment (FR-032)

- Reset tokens remain hashed in `app.password_reset_tokens` (BE-011); this task only authenticates the **mail path**.
- BE-027 should send as `mail_from_address` from env outputs and never hardcode secrets or private keys in the app.

## Module

`infra/terraform/modules/ses_email_domain` — wired from `environments/{dev,qa,prod}` using `module.dns_acm.zone_id`.

## Verification checklist (DoD) — mock complete

- [x] SPF record authorizing SES for the mail domain
- [x] DKIM (Easy DKIM CNAMEs) for the mail domain
- [x] DMARC policy record for the mail domain

## Live cutover

1. Replace `*.mi-iptv.example` with the real registered domain (same cutover as INF-004).
2. Request SES production access / leave sandbox as needed per account.
3. `terraform apply`; confirm SES domain identity `Verified` and DKIM `Success`.
4. Send a password-reset test; check headers for `spf=pass`, `dkim=pass`, `dmarc=pass`.
5. After a monitoring window, consider `mail_dmarc_policy = "reject"` on prod.
