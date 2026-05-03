# Treemich

Treemich is a standalone genealogy service and web UI for building and navigating family trees — relationships, life events, natural-language queries, GEDCOM import/export, and a 3D interactive graph.
No external account is required to get started: create a Treemich account with an email and password, then add people and relationships directly.
Optionally link an [Immich](https://immich.app/) account to import face thumbnails and photo co-occurrence suggestions.

## Features

- **Standalone, private trees** -- sign in with a Treemich email/password and keep people, relationships, media links, reports, and imports scoped to your account.
- **People, families, and evidence** -- manage profiles, alternate names, life events, places, family units, sources, repositories, media, and relationship types for family, friends, and pets.
- **Interactive tree view** -- navigate a 3D family graph with search, layer filters, single-tree focus, layout controls, thumbnails, and suggested relationships.
- **Plain-English relationship search** -- search for relatives such as `cousins of Mike`, `female grandchildren of Sue`, or `aunts of Mike born after 1980`.
- **GEDCOM interoperability** -- preview/import `.ged` files or ZIP media bundles, create missing people during import, and export GEDCOM 5.5.1 as `.ged`, ZIP, or async jobs. Import is gated by `TREEMICH_GEDCOM_IMPORT_ENABLED=true`; export is enabled by default.
- **Review tools** -- inspect duplicate-person candidates, merge confirmed duplicates, validate tree data, and generate printable pedigree, descendant, family group, and register reports.
- **Data portability** -- export Treemich-owned account data as JSON or ZIP without password hashes, session hashes, or encrypted provider tokens.
- **Optional Immich integration** -- link Immich only when you want face thumbnails or photo co-occurrence clues. Unlinking removes stored provider credentials but leaves copied Treemich data and your Immich library untouched.

Treemich stores editable birth, death, marriage, divorce, residence, census, and custom events as structured life events. Browser reports support living-person redaction, and GEDCOM import jobs apply records incrementally, so review the job summary before retrying a failed import.

## Project Layout

```
treemich/
  apps/
    api/          Fastify + Prisma backend
    web/          Vite + React + Three.js frontend
  packages/
    shared/       Shared types, Zod schemas, NL interpreter
```

## Quick Start with Docker Compose

You need **Docker** (Compose v2). Treemich stores its own data in PostgreSQL and can be used without Immich. Immich is optional for importing face thumbnails and photo co-occurrence suggestions.

Choose one of the following:

### A. Pre-built images (Docker Hub)

Images: **[schoksi/treemich](https://hub.docker.com/r/schoksi/treemich)** — tags such as `api-latest` / `web-latest`, or versioned release tags. No local `git clone` is required to _build_ images, but you still need the Compose file and env (clone this repo, or copy [`docker-compose.hub.yml`](docker-compose.hub.yml) and [`.env.example`](.env.example) to a folder on your machine).

**1. Configure environment**

```bash
cp .env.example .env
```

Edit `.env` and set at least:

| Variable                  | Required | Description                                                                                                                         |
| ------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `IMMICH_BASE_URL`         | No       | Optional Immich API URL for provider login/import. If Immich runs on the host machine, use `http://host.docker.internal:2283/api`.  |
| `TREEMICH_ENCRYPTION_KEY` | Yes      | A random 64-character hex string (`openssl rand -hex 32`). **Do not change** after you have data, or stored tokens become unusable. |
| `WEB_ORIGIN`              | No       | Defaults to `http://localhost:8080` in Compose. Use the URL users use in the browser (CORS + cookies).                              |

Optional: pin image tags (defaults are `api-latest` and `web-latest`):

| Variable           | Example      | Description                         |
| ------------------ | ------------ | ----------------------------------- |
| `TREEMICH_API_TAG` | `api-latest` | Tag for `schoksi/treemich` (API)    |
| `TREEMICH_WEB_TAG` | `web-latest` | Tag for `schoksi/treemich` (web UI) |

On Windows PowerShell you can set them for one run:

```powershell
$env:TREEMICH_API_TAG="api-latest"; $env:TREEMICH_WEB_TAG="web-latest"; docker compose -f docker-compose.hub.yml up -d
```

**2. Start the stack**

```bash
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

**3. Open the app**

[http://localhost:8080](http://localhost:8080) — sign in with an email and password. On a fresh install, the first Treemich email/password sign-in creates the first standalone account. Configure `IMMICH_BASE_URL` only when you want optional Immich login/import.

The API runs migrations on startup (`prisma migrate deploy`), then serves the app.

**Immich login/import unavailable:** If `IMMICH_BASE_URL` is unset, Immich provider login, thumbnail refresh, and co-occurrence import are disabled. If you configure Immich and it fails, the API container must reach Immich over the network. **`IMMICH_BASE_URL=http://localhost:2283/api` is wrong for Compose** when Immich runs on your machine — `localhost` inside the container is not your host. Use `http://host.docker.internal:2283/api` instead (Compose already maps `host.docker.internal`; Linux may need Docker 20.10+ with `host-gateway`). If Immich runs in another Docker network, use that service’s URL. Check `docker logs treemich-api` for connection errors.

---

### B. Build from source (this repository)

Use the default [`docker-compose.yml`](docker-compose.yml) to build API and web images locally:

```bash
cp .env.example .env
# edit .env — same variables as above (WEB_ORIGIN default is still http://localhost:8080 for Compose)

docker compose up --build -d
```

Same ports and behavior as the Hub stack.

---

### Containers and ports

| Service    | Container name      | Host port | Description                                  |
| ---------- | ------------------- | --------- | -------------------------------------------- |
| `postgres` | `treemich-postgres` | 54321     | PostgreSQL 16                                |
| `api`      | `treemich-api`      | 4000      | Fastify API (migrations on startup)          |
| `web`      | `treemich-web`      | 8080      | Nginx + static UI; proxies `/api` to the API |

### Stopping

```bash
docker compose down                    # build-from-source file
docker compose -f docker-compose.hub.yml down   # Hub images
```

Omit **`-v`** to keep the database volume. **`docker compose ... down -v`** deletes the named volume and **wipes Treemich’s database**.

## Updating

Schema changes apply automatically when the API container starts (`prisma migrate deploy`). To upgrade:

**Docker Hub**

```bash
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

Adjust `TREEMICH_API_TAG` / `TREEMICH_WEB_TAG` in `.env` (or your environment) when you want a specific release instead of `*-latest`.

**Build from source**

```bash
git pull
docker compose up --build -d
```

Your PostgreSQL data lives in the Docker volume `treemich-postgres` until you run `down -v`.

### After updating

- If the UI behaves oddly right after an upgrade, try a **hard refresh** (cached JavaScript) or clear site data for Treemich’s origin.
- If you use optional Immich imports, confirm provider login/import still matches your expectations after Immich upgrades.
- For existing installations crossing the person-native migration, follow [`docs/person-migration-runbook.md`](docs/person-migration-runbook.md) before and after deploy.

Image publishing from this repo (tags and GitHub Releases) is defined in [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml).

## Development Setup

### Prerequisites

- Node.js **20.19+** or **22.12+** (required by Vite 8 / Rolldown; see root `package.json` `engines`)
- PostgreSQL (or use `docker compose up -d postgres` for a containerized instance)
- An [Immich](https://immich.app/) instance _(optional — only needed for Immich login, thumbnail import, and photo co-occurrence)_

### 1. Configure environment

```bash
cp .env.example .env
```

Set `TREEMICH_ENCRYPTION_KEY` to a random 64-char hex string. Set `IMMICH_BASE_URL` only if you want optional Immich login, thumbnail import, or co-occurrence import. When unset, standalone Treemich features still work.

### 2. Start PostgreSQL

```bash
docker compose up -d postgres
```

### 3. Install dependencies

```bash
npm install
```

### 4. Generate Prisma client and run migrations

```bash
npm run prisma:generate -w @treemich/api
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

### 5. Start dev servers

```bash
npm run dev
```

This starts the API on `localhost:4000` and the web app on `localhost:5173` with a Vite proxy forwarding `/api` to the API.

## Environment Variables

| Variable                       | Default                 | Description                                                                        |
| ------------------------------ | ----------------------- | ---------------------------------------------------------------------------------- |
| `PORT`                         | `4000`                  | API server port                                                                    |
| `DATABASE_URL`                 | --                      | PostgreSQL connection string                                                       |
| `IMMICH_BASE_URL`              | _(unset)_               | Optional Immich API base URL; when unset, Immich provider login/import is disabled |
| `IMMICH_PEOPLE_PAGE_SIZE`      | `1000`                  | Page size when fetching people from Immich                                         |
| `TREEMICH_ENCRYPTION_KEY`      | --                      | 64-char hex key for encrypting stored Immich tokens                                |
| `TREEMICH_SESSION_COOKIE_NAME` | `treemich_session`      | Browser cookie name                                                                |
| `TREEMICH_SESSION_TTL_MS`      | `2592000000` (30 days)  | Session lifetime                                                                   |
| `WEB_ORIGIN`                   | `http://localhost:5173` | CORS allowed origin                                                                |
| `RATE_LIMIT_MAX`               | `300`                   | Max API requests per time window                                                   |
| `RATE_LIMIT_TIME_WINDOW_MS`    | `60000`                 | Rate limit window in ms                                                            |
| `VITE_TREEMICH_API_URL`        | `/api`                  | Frontend API base URL (build-time)                                                 |

## Auth Model

- Sign in with a Treemich email and password (standalone; no Immich required).
- Optionally sign in via Immich credentials (`provider: "immich"` in the login body) as a legacy migration/provider path when `IMMICH_BASE_URL` is configured.
- Treemich stores a session cookie for browser auth. Immich tokens are encrypted at rest and used only for optional provider calls.
- All relationship and profile data is private per Treemich user.

## API Endpoints

| Method   | Path                              | Description                                             |
| -------- | --------------------------------- | ------------------------------------------------------- |
| `POST`   | `/auth/login`                     | Sign in (email+password standalone, or Immich provider) |
| `POST`   | `/auth/logout`                    | End session                                             |
| `GET`    | `/auth/me`                        | Current session state                                   |
| `GET`    | `/auth/link-status`               | Immich link status (optional provider)                  |
| `GET`    | `/people`                         | List Treemich-owned people                              |
| `POST`   | `/people`                         | Create a new person (no Immich required)                |
| `PATCH`  | `/people/:id`                     | Update person profile (gender, birth date, names)       |
| `GET`    | `/people/:id`                     | Get a single person                                     |
| `GET`    | `/people/:id/thumbnail`           | Person thumbnail (Immich or SVG initials fallback)      |
| `GET`    | `/people/:id/external-identities` | List external identities (e.g. Immich)                  |
| `POST`   | `/people/:id/external-identities` | Add an external identity link                           |
| `GET`    | `/people/duplicates`              | List duplicate person candidates                        |
| `POST`   | `/people/duplicates/recompute`    | Recompute duplicate person candidates                   |
| `PATCH`  | `/people/duplicates/:id`          | Dismiss or reopen a duplicate candidate                 |
| `POST`   | `/people/duplicates/:id/merge`    | Merge a reviewed duplicate into canonical person        |
| `POST`   | `/people/:id/relationships`       | Create a relationship                                   |
| `DELETE` | `/people/:id/relationships`       | Delete a relationship                                   |
| `GET`    | `/relationships`                  | List all relationships (paginated)                      |
| `GET`    | `/people/cooccurrence`            | Photo co-occurrence data (requires Immich link)         |
| `GET`    | `/search?q=...`                   | Natural-language relationship search                    |

### Example requests

**Sign in:**

```bash
curl -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"secret"}'
```

**Create a relationship:**

```bash
curl -X POST http://localhost:4000/people/PERSON_ID/relationships \
  -H 'Content-Type: application/json' \
  -H 'Cookie: treemich_session=SESSION_TOKEN' \
  -d '{"toPersonId":"OTHER_PERSON_ID","relationshipType":"CHILD_OF"}'
```

Relationship types supported by create/delete endpoints: `PARENT_OF`, `CHILD_OF`, `SPOUSE_OF`, `SIBLING_OF`, `FRIEND_OF`, `PET_OF`.

**Search for relatives:**

```bash
curl 'http://localhost:4000/search?q=sisters%20of%20Mike' \
  -H 'Cookie: treemich_session=SESSION_TOKEN'
```

## Development Commands

```bash
npm run dev          # start API + web in dev mode
npm run build        # production build
npm run lint         # eslint + prettier + tsc
npm run test         # run all tests
```

## Notes on Existing Data

- Migration `0003_add_user_scoping_and_auth` moves legacy shared relationship/profile rows onto a temporary legacy owner.
- The first real user who signs in and has no existing Treemich-scoped data will claim that legacy dataset.
- For a fresh environment, just run the migrations normally.
