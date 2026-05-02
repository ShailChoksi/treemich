# Treemich

Treemich is a standalone genealogy service and web UI for building and navigating family trees — relationships, life events, natural-language queries, GEDCOM import/export, and a 3D interactive graph.
No external account is required to get started: create a Treemich account with an email and password, then add people and relationships directly.
Optionally link an [Immich](https://immich.app/) account to import face thumbnails and photo co-occurrence suggestions.

## Features

- **Standalone people management** -- create and edit Treemich-owned people; Immich is optional.
- **Relationship management** -- create parent/child, sibling, spouse, friend, and pet links between people.
- **Per-person profiles** -- set gender, names, and Treemich **life events** (BIRTH/DEATH with optional places); quick-edit fields in the sidebar map to those events.
- **3D graph visualization** -- interactive Three.js graph with multiple layout modes (generation tree, centered map, hybrid, cleaned 3D) plus layer toggles for Family/Friends/Pets.
- **Natural-language search** -- query relationships in plain English with multi-hop graph traversal.
- **Duplicate review and merge** -- recompute possible duplicate Treemich people, review scored reasons, dismiss candidates, and merge with explicit canonical-person confirmation.
- **Printable reports** -- generate pedigree, descendant, family group sheet, and register/narrative reports, then print or save to PDF from the browser.
- **Photo co-occurrence** -- discover which people appear together in photos.
- **Per-user privacy** -- all relationship data is scoped to the authenticated Treemich user.

### Life events and birth display

Treemich stores editable **BIRTH**, **DEATH**, **MARRIAGE**, and **DIVORCE** as [life events](apps/api/src/lifeEvents/service.ts). The merged `birthDate` on each person prefers the BIRTH life event, then Immich’s person `birthDate` (reference in the sidebar).

### Account data export (Phase 0)

Authenticated users can download a snapshot of Treemich-owned data (people, external identities, thumbnails, relationships, places, life events, co-occurrence metadata, etc.) **without** Immich access tokens or other secret material:

- **`GET /api/export/account`** (default) — same as **`GET /api/export/account?format=json`**. Response is `application/json` with `Content-Disposition: attachment`. The JSON object uses `exportVersion: 2`, includes `people`, `personExternalIdentities`, `personThumbnails`, and all relational tables the server stores for that user. Sensitive fields such as password hashes, session `tokenHash`, and linked-account encrypted token material are omitted.

- **`GET /api/export/account?format=zip`** — `application/zip` attachment containing:
  - **`account.json`** — the same payload as the JSON export above.
  - **`manifest.json`** — describes the archive (`treemichExportManifestVersion`, `payloadExportVersion`, `exportedAt`, and the list of files).
  - **`thumbnails/...`** — Treemich-owned person thumbnail binaries referenced by `personThumbnails[].exportBinaryPath` when local thumbnail files are available.

`GET /api/export/account?version=1` is retained for compatibility with older tooling and uses the legacy `personProfiles` collection name. New integrations should use the default v2 shape.

Use the same session cookie as the rest of the API.

### GEDCOM export (Phase 5a)

Interoperability export as **GEDCOM 5.5.1** UTF-8 (`LINEAGE-LINKED`), including **INDI**, **FAM** (with **CHIL** + **PEDI** when families exist), person-scoped and family-scoped life events, spouse **MARR**/**DIV** on unions, **SOUR**/**REPO**, and **OBJE** stubs for evidence media. Optional custom line **`_TREEMICH_PERSON_ID`** maps each `INDI` back to the Treemich person id (disable with `includeTreemichCustomTags=0` if your toolchain rejects unknown tags). Export does not emit the legacy Immich-provider hint `_TREEMICH_IMMICH_PERSON_ID` by default; import still accepts it for older Treemich GEDCOM files.

- **`GET /api/export/gedcom`** (default) — same as **`?format=ged`**. Response is `text/plain; charset=utf-8` with `Content-Disposition: attachment` (`.ged`).

- **`GET /api/export/gedcom?format=zip`** — `application/zip` containing **`treemich.ged`**, **`treemich-gedcom-xrefs.json`** (maps `I0001`/`F0001`/… xrefs to Treemich ids), and **`manifest.json`**.

- **`GET /api/export/gedcom?redactLiving=1`** — omits person-scoped life-event blocks for individuals who have **no** `DEATH` life event (living heuristic). Union structure (**FAM**, **FAMS**, **FAMC**) is still exported.

- **`POST /api/export/gedcom/jobs`** — queues an async GEDCOM export. Poll **`GET /api/export/gedcom/jobs/:jobId`** for status; completed jobs include a session-authenticated result path and an expiring signed `downloadUrl` token. The signed token currently expires after 15 minutes.

Disable the route in restrictive environments with **`TREEMICH_GEDCOM_EXPORT_ENABLED=false`** (default when unset: enabled).

### Reports (Phase 6 / Phase E)

The **Reports** workspace generates browser-printable genealogy reports from structured API data:

- **`GET /api/reports/pedigree?rootPersonId=&depth=&redactLiving=`**
- **`GET /api/reports/descendants?rootPersonId=&depth=&redactLiving=`**
- **`GET /api/reports/family-group?familyId=&redactLiving=`**
- **`GET /api/reports/register?rootPersonId=&depth=&redactLiving=`**

Reports are session-authenticated and scoped to the current Treemich user. `redactLiving=true` keeps family structure but replaces people without a `DEATH` life event with `Living person` and suppresses dates, places, notes, alternate names, citations, and media details for those people.

Depth defaults are pedigree `4`, descendants `3`, and register `3`. Operators can set **`TREEMICH_REPORT_MAX_DEPTH`** (default `6`, hard-capped at `10`) and **`TREEMICH_REPORT_MAX_PEOPLE`** (default `1000`). Requests above caps return validation errors instead of truncated reports. Server-side PDF jobs are intentionally not part of v1; use **Print / Save PDF** in the browser.

### GEDCOM import (Phase 5b)

Imports **UTF-8 GEDCOM** into Treemich, either by matching INDI records to existing Treemich people or by automatically creating new Treemich people for unmatched records. The browser uploads a **`.ged`** or **`.zip`** media bundle; the server stages a **preview session** (per user, TTL ~24h) so the UI can page/search preview rows before starting the async job from that same staged file.

1. **`POST /api/import/gedcom/previews`** — multipart form field **`file`**: a `.ged` (UTF-8) or a `.zip` bundle (exactly one `.ged` inside plus optional media). Creates a preview session and returns **`previewId`**, **`summary`** (totals, hint counts, **`famMatchError`** when **HUSB** / **WIFE** / **CHIL** pointers cannot be resolved), **`lineLog`**, **`archiveMediaFiles`**, and the **first page** of enriched INDI rows (`xref`, **`fullName`**, alternate names, **`birthDate`** text, **`relatedPeople`** summaries from **FAM**, optional **`_TREEMICH_PERSON_ID`** / legacy Immich hints). **`DELETE /api/import/gedcom/previews/:previewId`** removes the session and staged data (also used after a successful import submit).
2. **`GET /api/import/gedcom/previews/:previewId/indis`** — query **`offset`**, **`limit`** (default page size 50), **`filter=all|unmatched`**, optional **`q`** (search across names, birth text, related names, xref), and **`matchedXrefs`** (comma-separated xrefs the client already matched, excluded from the unmatched filter). Returns **`total`** and **`rows`** in GEDCOM file order.
3. **`POST /api/import/gedcom/jobs/from-preview`** — JSON `{ "previewId", "indiMatches": { "@I1@": "<treemichPersonId>", ... }, "importOptions"? }`. Creates an async job from the **staged** file for that session (`PENDING` → `RUNNING` → `COMPLETED` or `FAILED`) and applies **REPO**, **SOUR**, **FAM** (via `Family` + derived edges), **MARR**/**DIV** on the spouse relationship, family-scoped **RESI**/**CENS**/**EVEN**, and **INDI** names / **SEX** / person life events. **`importOptions`**: `dryRun`, `skipAlreadyImportedIndis`, `allowPartialMatches`, `unmatchedIndiPolicy` (`"MATCH_ONLY"` vs `"CREATE"`).
4. **`GET /api/import/gedcom/jobs/:jobId`** — poll status, **`summary`** counts, **`lineLog`**, **`errorMessage`**. `lineLog` is capped by `TREEMICH_GEDCOM_IMPORT_MAX_LINE_LOG` and includes a truncation warning when entries are omitted.

ZIP uploads use the same **`POST /api/import/gedcom/previews`** endpoint; **`POST /api/import/gedcom/jobs/from-preview`** runs the importer with staged archive paths so **`OBJE`** **`FILE`** entries resolve to ZIP members, binaries are stored under **`TREEMICH_MEDIA_STORAGE_DIR`**, and `MediaObject` / `MediaLink` rows are created for supported targets. Remote `http(s)` `FILE` values stay references; local paths need the bundle.

**Limits:** payload size defaults to **3 MB** UTF-8 (`TREEMICH_GEDCOM_IMPORT_MAX_BYTES`); parser line cap **`TREEMICH_GEDCOM_IMPORT_MAX_LINES`** (default 250k); diagnostic line-log cap **`TREEMICH_GEDCOM_IMPORT_MAX_LINE_LOG`** (default 2000). Media ZIP uploads default to **100 MB** (`TREEMICH_GEDCOM_MEDIA_MAX_BYTES`) and individual media files default to **50 MB** (`TREEMICH_GEDCOM_MEDIA_MAX_FILE_BYTES`). Imported media is stored under **`TREEMICH_MEDIA_STORAGE_DIR`** (Compose defaults to `/data/media`, backed by the `treemich-media` volume).

GEDCOM import uses resilient per-entity apply rather than one global transaction. If a job fails, earlier records may already have been written; review the job `summary`, `lineLog`, and `errorMessage` before retrying.

**Enable** with **`TREEMICH_GEDCOM_IMPORT_ENABLED=true`** (default when unset: **disabled**). Apply migration **`0019_gedcom_import_job`**.

### Treemich user deletion (PostgreSQL cascade)

Deleting a **`TreemichUser`** row (for example via Prisma or direct SQL) **cascades** to all Treemich-owned graph data linked by `userId`: linked Immich account row, sessions, person profiles, relationships, places, life events (and citations), and co-occurrence tables. If you have a linked Immich account, **Immich itself is unchanged** — people, faces, and photos remain in your Immich instance.

There is currently **no** dedicated “delete my Treemich account” HTTP button in the shipped UI; operators or scripts can delete the user row if you need a full Treemich data purge.

### Immich unlink behavior

Immich is an optional provider. Unlinking Immich removes stored provider credentials and stops future Immich refresh/import jobs. Data already copied into Treemich remains:

- Imported person thumbnails stay available as Treemich-owned thumbnail files.
- Imported photo co-occurrence edges stay available as evidence/suggestions with provider provenance metadata.
- Immich assets, faces, and photos remain unchanged in Immich.

Relink Immich to refresh thumbnails or import new co-occurrence data.

### Duplicate review and merge (Phase D)

Treemich stores duplicate candidates separately from validation findings. Use the **Duplicates** workspace to review possible duplicate people before any data changes happen.

- **`GET /api/people/duplicates?status=PENDING`** — list persisted duplicate candidates.
- **`POST /api/people/duplicates/recompute`** — recompute candidate pairs from names, alternate names, birth/death dates, close family graph overlap, and supporting co-occurrence signals.
- **`PATCH /api/people/duplicates/:id`** — set candidate status to `PENDING` or `DISMISSED`.
- **`POST /api/people/duplicates/:id/merge`** — merge after user confirmation. Body: `{ "canonicalPersonId": "...", "duplicatePersonId": "...", "confirm": true }`.

Merge operates only on Treemich-owned people for the signed-in user. It moves known Treemich person references to the canonical person in one DB transaction, preserves distinct external identities, writes a `PersonMergeAudit` row, and deletes the duplicate profile last. It does **not** merge Immich faces or people.

### Upgrading from releases before legacy column removal

Phase 0 uses **two** migrations:

1. [`0011_phase0_add_person_profile_external_ids`](apps/api/prisma/migrations/0011_phase0_add_person_profile_external_ids/migration.sql) — adds `PersonProfile.externalIds` only (legacy date columns stay for one more step).
2. [`0012_phase0_drop_legacy_date_columns`](apps/api/prisma/migrations/0012_phase0_drop_legacy_date_columns/migration.sql) — drops legacy Treemich date/place columns on profiles and spouse rows.

**Recommended upgrade path** for an existing database that still has legacy columns and may predate full life-event mirroring:

1. Run the backfill **before** applying these migrations (while the old schema is still deployed, or at minimum before migration **0012** removes the legacy columns):

```bash
npm run phase0:backfill --workspace @treemich/api
```

2. Deploy the new API / run `prisma migrate deploy` so **0011** then **0012** apply in order.

Advanced: if you ship **0011** alone first, you can run the backfill after **0011** and before **0012** (legacy columns still exist between the two). A single `migrate deploy` applies both in one go, so the usual approach is backfill **first**, then migrate.

Fresh installs with no legacy data can skip the backfill.

**Dev note:** If your machine ever applied the removed combined migration folder `0011_phase0_external_ids_drop_legacy_dates`, delete that row from `_prisma_migrations` and align the schema, or reset the dev database, then use the split migrations above.

### Natural-Language Search

Search for relatives using plain English in the search bar. Queries follow the pattern:

```
[male/female] <relationship> of <person name> [age filter]
```

**Supported relationships:**

| Query                                   | Example                  |
| --------------------------------------- | ------------------------ |
| son/daughter/children of                | `children of Mike`       |
| father/mother/parents of                | `mother of Sarah`        |
| brother/sister/siblings of              | `sisters of Mike`        |
| spouse of                               | `spouse of Anna`         |
| grandfather/grandmother/grandparents of | `grandparents of Tom`    |
| grandson/granddaughter/grandchildren of | `grandchildren of Sue`   |
| uncle/aunt of                           | `uncle of Mike`          |
| nephew/niece of                         | `nieces of Lisa`         |
| cousin/first cousin of                  | `cousins of Mike`        |
| second cousin of                        | `second cousins of Mike` |

**Gender prefix** -- prepend `male` or `female` to any query:

```
female cousins of Mike
male grandchildren of Sue
```

**Age/birthday filters** -- append to any query:

```
cousins of Mike older than 20
sisters of Mike under 18
uncles of Mike between 40 and 60
aunts of Mike born after 1980
aunts of Mike born in 2005
```

**Combined:**

```
female second cousins of Mike older than 20
```

Relationship search includes alternate Treemich names by default. Turn off **Match alternate Treemich names in relationship search** in the Settings workspace if you want natural-language source-person matching to use only primary display/profile names.

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

Images: **[schoksi/treemich](https://hub.docker.com/r/schoksi/treemich)** — tags such as `api-latest` / `web-latest`, or versioned tags (for example `api-0.1.1` / `web-0.1.1`) if you publish them. No local `git clone` is required to _build_ images, but you still need the Compose file and env (clone this repo, or copy [`docker-compose.hub.yml`](docker-compose.hub.yml) and [`.env.example`](.env.example) to a folder on your machine).

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

| Variable           | Example     | Description                         |
| ------------------ | ----------- | ----------------------------------- |
| `TREEMICH_API_TAG` | `api-0.1.1` | Tag for `schoksi/treemich` (API)    |
| `TREEMICH_WEB_TAG` | `web-0.1.1` | Tag for `schoksi/treemich` (web UI) |

On Windows PowerShell you can set them for one run:

```powershell
$env:TREEMICH_API_TAG="api-0.1.1"; $env:TREEMICH_WEB_TAG="web-0.1.1"; docker compose -f docker-compose.hub.yml up -d
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

- Sign in with a Treemich email and password (standalone; no Immich required). A fresh install can bootstrap the first password-backed Treemich user from the first email/password login; after any password-backed user exists, unknown Treemich emails are rejected instead of self-registering.
- Optionally sign in via Immich credentials (`provider: "immich"` in the login body) as a legacy migration/provider path when `IMMICH_BASE_URL` is configured.
- Legacy rows with the same normalized email can exist after migrations. Password login checks all candidates for that email, keeps only rows whose stored password matches, then chooses the row with the most `PersonProfile` records, newest `updatedAt`, and finally lowest id. If matching candidates have no password yet, the selected row is claimed by setting its password.
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
