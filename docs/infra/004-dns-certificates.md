# INF-004: DNS and certificates

- **Status:** Accepted (Sprint 0 **mock** Terraform — no live apply)
- **Refs:** Infra §2.2; ADR-001 (Route 53 + ACM on ALB); INF-001
- **Task:** INF-004
- **Mock date:** 2026-11-11

## Goal

Define **public DNS names** for the **API** and **realtime** endpoints and provision **ACM TLS certificates** that renew automatically (DNS validation).

## Design

| Concern | Choice |
| --- | --- |
| DNS | **Amazon Route 53** public hosted zone per environment (ADR-001) |
| TLS | **AWS Certificate Manager (ACM)** in the workload region (`us-east-1` mock) |
| Validation | DNS (Route 53 records in the same zone) |
| Renewal | **Automatic** by ACM for DNS-validated certificates (no Let's Encrypt / certbot in-app) |
| Consumers | ALB HTTPS listener (later INF compute/edge task); health check remains `/health` |

Cloudflare DNS remains an optional future edge alternative (ADR-001); Sprint 0 freezes Route 53 + ACM.

### Domains (mock root `.example`)

Mock apex uses the reserved `example` TLD so names are clearly non-production until a real domain is purchased and substituted via `dns_zone_name`.

| Env | Hosted zone | API FQDN | Realtime FQDN |
| --- | --- | --- | --- |
| `dev` | `dev.mi-iptv.example` | `api.dev.mi-iptv.example` | `realtime.dev.mi-iptv.example` |
| `qa` | `qa.mi-iptv.example` | `api.qa.mi-iptv.example` | `realtime.qa.mi-iptv.example` |
| `prod` | `mi-iptv.example` | `api.mi-iptv.example` | `realtime.mi-iptv.example` |

Both hostnames are SANs on **one** ACM certificate per environment (ALB can present a single cert for api + realtime listeners / host-based routing).

### Certificate lifecycle

1. Terraform creates `aws_acm_certificate` (`DNS` validation) for `api.*` + `realtime.*`.
2. Module writes Route 53 validation CNAMEs from `domain_validation_options`.
3. `aws_acm_certificate_validation` completes issuance when nameservers are live.
4. ACM **auto-renews** before expiry while DNS validation records remain; no manual renewal job in the backend.

### Alias records (follow ALB)

Optional A/AAAA alias records to the ALB are supported when `alb_dns_name` / `alb_zone_id` are supplied at live cutover. Sprint 0 leaves them unset — domains and certs are the DoD; traffic wiring waits on the ALB module.

## Module

`infra/terraform/modules/dns_acm` — wired from `environments/{dev,qa,prod}`.

## Verification checklist (DoD) — mock complete

- [x] Domain for API endpoint (`api…` FQDN per env)
- [x] Domain for realtime endpoint (`realtime…` FQDN per env)
- [x] Automatically renewed TLS certificates (ACM + DNS validation)

## Live cutover

1. Replace `*.mi-iptv.example` with the real registered domain; update registrar NS to the Route 53 zone NS outputs.
2. `terraform apply` ACM + validation; confirm certificate status `ISSUED`.
3. Attach certificate ARN to the ALB HTTPS listener; set alias records for `api` / `realtime`.
4. Point clients at the env FQDNs (never hardcode cert material in the app repo).
