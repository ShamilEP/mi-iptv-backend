# ADR-001: Cloud provider and managed data plane

- **Status:** Accepted
- **Date:** 2026-11-10
- **Deciders:** Product (PRD-001)
- **Refs:** SRS §24; Infra §2; Security §3 (credential encryption / KMS)

## Context

The MVP backend needs a managed cloud host before Infra provisions DEV / QA / PROD. Specs leave the vendor open as AWS vs GCP (compute, PostgreSQL, Redis, KMS). Priorities for Sprint 0: low operational overhead, clear managed services, and a stack that matches auth, sync, catalog, devices, and realtime (Redis pub/sub).

## Decision

**Use Amazon Web Services (AWS)** as the cloud provider for Mi IPTV MVP backend and supporting managed data services.

| Concern | Choice |
| --- | --- |
| Compute | **Amazon ECS on AWS Fargate** (Dockerized modular monolith; autoscale on CPU / concurrent WebSocket load per Infra §2.2) |
| Relational DB | **Amazon RDS for PostgreSQL** (app schema; automated daily backups) |
| Cache / pub-sub | **Amazon ElastiCache for Redis** (sessions, refresh-token support, realtime fan-out) |
| Encryption keys | **AWS KMS** (envelope keys for AES-256-GCM source-credential ciphertext; no keys in source or DB cleartext) |
| TLS entry | **Application Load Balancer** with ACM certificates; health check on `/health` |
| Static catalog assets (CDN) | **Amazon CloudFront** (optional Cloudflare DNS/CDN remains acceptable at the edge if Infra prefers it later) |
| DNS | **Amazon Route 53** (or Cloudflare DNS if edge is unified there) |

Environments remain **DEV**, **QA/Staging**, and **PROD** as separate accounts or strongly isolated projects with least-privilege IAM and MFA (handover to INF-001+).

## Consequences

- Infra provisions AWS accounts/IAM, networking, ECS/Fargate service, RDS PostgreSQL, ElastiCache Redis, and KMS key policy before production traffic.
- Backend config references env **names** only (`DATABASE_URL`, Redis URL, KMS key id/ARN, etc.); secrets never committed.
- Observability may start with **CloudWatch Logs** (or Grafana Loki later); QoE dashboards stay product-defined.
- Revisit only if cost, region availability, or team constraints force a vendor change; a new ADR would supersede this one.

## Rejected for MVP

- **GCP** (Cloud Run + Cloud SQL + Memorystore + Cloud KMS) — viable and simpler for scale-to-zero, but not selected.
- **Azure** or other clouds — out of scope for this decision.
- Self-managed Postgres/Redis on EC2 — rejected; managed services are required for MVP ops simplicity.
