# Treemich API Release Operations

## Pre-Release Gates

- Run `npm run lint`, `npm run test`, `npm run test:coverage -w @treemich/api`, and `npm run build`.
- Run `npx prisma migrate deploy --schema apps/api/prisma/schema.prisma` against a throwaway Postgres database before publishing an image.
- Run `npm audit --omit=dev` and review any production dependency findings before release.
- Verify `WEB_ORIGIN`, `TREEMICH_ENCRYPTION_KEY`, `DATABASE_URL`, `IMMICH_BASE_URL`, and `TREEMICH_TRUST_PROXY` for the target environment.

## Health And Readiness

- `/health` is a lightweight process liveness check.
- `/ready` verifies database connectivity and is the container readiness probe used by Docker Compose.
- Alert if `/ready` fails for more than two consecutive probe windows after startup.

## Background Jobs

- GEDCOM import/export jobs are claimed atomically and can be reclaimed after `TREEMICH_GEDCOM_JOB_STALE_AFTER_MS`.
- Alert on jobs stuck in `RUNNING` longer than the stale threshold and on repeated `FAILED` jobs for the same user.
- Async GEDCOM export jobs expose a session-authenticated result route and an expiring signed download URL. The signed URL currently expires after 15 minutes and the generated GEDCOM payload is stored on the job row, not in object storage.
- GEDCOM job execution is still in-process by Phase B decision. Multi-replica deployments should run only one active API/worker for GEDCOM jobs, or add an external queue/worker before increasing job volume.
- GEDCOM import uses resilient per-entity apply, not one global transaction. A failed job may have already created or updated earlier records; review the route-visible `errorMessage`, `summary`, and capped `lineLog` before retrying.
- GEDCOM `lineLog` is structured JSON capped by `TREEMICH_GEDCOM_IMPORT_MAX_LINE_LOG`; when entries are omitted the API includes a truncation warning. Do not treat line logs as raw GEDCOM archives: they may still contain names, ids, source titles, or file paths, so avoid forwarding them to third-party systems without PII review.
- Co-occurrence refreshes should be owned by a single API/worker process in production deployments. If multiple replicas are used, prefer a dedicated worker or leader-election wrapper before increasing scheduled-job volume.

## Capacity Limits

- `TREEMICH_EXPORT_MAX_ROWS` protects synchronous account and GEDCOM export paths from loading very large accounts into memory.
- Graph layout requests are rejected above the server-side person/relationship caps.
- Co-occurrence legacy graph responses are capped; clients should use cursor-based edge APIs for large datasets.

## Rollback

- Keep the previous image tag available until the release has passed smoke checks.
- Treat Prisma migrations as forward-only. If a migration causes data issues, restore from a verified database backup or ship a forward-fix migration.
- Before rollback, record API image tag, migration version, failing endpoint/job IDs, and whether background workers were active.
