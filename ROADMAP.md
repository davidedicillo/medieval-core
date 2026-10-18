# Roadmap

## Phase 0: OSS Readiness

- Apache-2.0 license, contribution docs, security notes, and public positioning.
- Clear open-core boundary between the self-hosted core and future paid cloud.
- Runtime data excluded from git.

## Phase 1: Public Core

- Generic iOS reviewer app and shared eval card/result contracts.
- Self-hostable eval API and dashboard.
- Example cards and CLI helpers for import/export.
- Verification that the mobile flow stays idempotent and durable.

## Phase 2: Self-Hosted Dashboard

- Local dashboard for importing cards, tracking queue progress, and exporting
  JSONL/CSV human labels.
- Durable JSONL rows as the source of truth.
- Basic run summaries for first internal users.

## Later Paid Layers

- Hosted MediEval Cloud.
- Team roles, assignments, calibration, consensus, audit logs, SSO, and backups.
- Managed reviewer bench after repeated customer demand proves the need.

