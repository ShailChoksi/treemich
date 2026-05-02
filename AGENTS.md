# Agent Instructions

## Testing

- Always add tests (unit, e2e, integration) for any new feature, bug fix or regression.
- When tests fail, fix the underlying code — never comment out tests, skip them, or change assertions to make them pass.

## Cursor Cloud specific instructions

### Services overview

| Service                | How to run                         | Port                |
| ---------------------- | ---------------------------------- | ------------------- |
| PostgreSQL 16          | `docker compose up -d postgres`    | 54321 (host) → 5432 |
| API (Fastify + Prisma) | `npm run dev:api` or `npm run dev` | 4000                |
| Web (Vite + React)     | `npm run dev:web` or `npm run dev` | 5173                |

### Quick start (after update script has run)

1. Ensure Docker daemon is running: `dockerd &>/var/log/dockerd.log &` (wait ~5s)
2. `docker compose up -d postgres` — start PostgreSQL
3. `npx prisma migrate deploy --schema apps/api/prisma/schema.prisma` — apply any new migrations
4. `npm run dev` — starts both API (:4000) and Web (:5173) concurrently

### Key development commands

See `README.md` "Development Commands" section. Summary:

- `npm run lint` — ESLint + Prettier + TypeScript type-check (all workspaces)
- `npm run test` — Vitest across shared/api/web packages
- `npm run build` — production build (shared → api → web)
- `npm run dev` — concurrent API + Web dev servers

### Non-obvious caveats

- The **first login** with a new email/password auto-creates the Treemich account (no separate signup endpoint).
- `npm run lint` builds `@treemich/shared` first (needed for type-checking downstream packages).
- `npm run test` also builds `@treemich/shared` first before running tests.
- Prisma client must be generated after `npm install` before the API can start: `npm run prisma:generate -w @treemich/api`.
- Docker in this VM requires `fuse-overlayfs` storage driver and `iptables-legacy` (not nftables). Ensure these are set before starting `dockerd`.
- The `.env` file needs `TREEMICH_ENCRYPTION_KEY` set to a 64-char hex string (`openssl rand -hex 32`). Without it the API will crash on startup.
- Immich integration is entirely optional. The app works standalone with email/password auth and manual person creation.