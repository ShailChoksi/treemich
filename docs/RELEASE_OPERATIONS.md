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
- Co-occurrence refreshes should be owned by a single API/worker process in production deployments. If multiple replicas are used, prefer a dedicated worker or leader-election wrapper before increasing scheduled-job volume.

## Capacity Limits

- `TREEMICH_EXPORT_MAX_ROWS` protects synchronous account and GEDCOM export paths from loading very large accounts into memory.
- Graph layout requests are rejected above the server-side person/relationship caps.
- Co-occurrence legacy graph responses are capped; clients should use cursor-based edge APIs for large datasets.

## Rollback

- Keep the previous image tag available until the release has passed smoke checks.
- Treat Prisma migrations as forward-only. If a migration causes data issues, restore from a verified database backup or ship a forward-fix migration.
- Before rollback, record API image tag, migration version, failing endpoint/job IDs, and whether background workers were active.
