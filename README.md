# Treemich

Treemich is a standalone service and web UI that extends [Immich](https://immich.app/) with family-tree relationships, natural-language relationship queries, and a 3D interactive graph.

Immich remains the system of record for photos, faces, and people. Treemich adds a per-user relationship graph on top, stored in its own PostgreSQL database.

## Features

- **Relationship management** -- create parent/child, sibling, spouse, friend, and pet links between Immich people.
- **Per-person profiles** -- set gender and birth date overrides on any Immich person.
- **3D graph visualization** -- interactive Three.js graph with multiple layout modes (generation tree, centered map, hybrid, cleaned 3D) plus layer toggles for Family/Friends/Pets.
- **Natural-language search** -- query relationships in plain English with multi-hop graph traversal.
- **Photo co-occurrence** -- discover which people appear together in photos.
- **Per-user privacy** -- all relationship data is scoped to the authenticated Treemich user.

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

You need **Docker** (Compose v2) and an **Immich** instance. Treemich stores its own data in PostgreSQL; Immich stays the source for photos and people.

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
| `IMMICH_BASE_URL`         | Yes      | Your Immich API URL. If Immich runs on the host machine, use `http://host.docker.internal:2283/api`.                                |
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

[http://localhost:8080](http://localhost:8080) — sign in with your Immich email and password.

The API runs migrations on startup (`prisma migrate deploy`), then serves the app.

**Login fails or returns HTTP 500:** The API container must reach Immich over the network. **`IMMICH_BASE_URL=http://localhost:2283/api` is wrong for Compose** when Immich runs on your machine — `localhost` inside the container is not your host. Use `http://host.docker.internal:2283/api` instead (Compose already maps `host.docker.internal`; Linux may need Docker 20.10+ with `host-gateway`). If Immich runs in another Docker network, use that service’s URL. Check `docker logs treemich-api` for connection errors.

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
- When Immich is upgraded, confirm Treemich still matches your expectations; check release notes if something breaks.

Image publishing from this repo (tags and GitHub Releases) is defined in [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml).

## Development Setup

### Prerequisites

- Node.js **20.19+** or **22.12+** (required by Vite 8 / Rolldown; see root `package.json` `engines`)
- PostgreSQL (or use `docker compose up -d postgres` for a containerized instance)
- An Immich instance

### 1. Configure environment

```bash
cp .env.example .env
```

Set `IMMICH_BASE_URL` to your Immich API URL and `TREEMICH_ENCRYPTION_KEY` to a random 64-char hex string.

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

| Variable                       | Default                 | Description                                         |
| ------------------------------ | ----------------------- | --------------------------------------------------- |
| `PORT`                         | `4000`                  | API server port                                     |
| `DATABASE_URL`                 | --                      | PostgreSQL connection string                        |
| `IMMICH_BASE_URL`              | --                      | Immich API base URL                                 |
| `IMMICH_PEOPLE_PAGE_SIZE`      | `1000`                  | Page size when fetching people from Immich          |
| `TREEMICH_ENCRYPTION_KEY`      | --                      | 64-char hex key for encrypting stored Immich tokens |
| `TREEMICH_SESSION_COOKIE_NAME` | `treemich_session`      | Browser cookie name                                 |
| `TREEMICH_SESSION_TTL_MS`      | `2592000000` (30 days)  | Session lifetime                                    |
| `WEB_ORIGIN`                   | `http://localhost:5173` | CORS allowed origin                                 |
| `RATE_LIMIT_MAX`               | `300`                   | Max API requests per time window                    |
| `RATE_LIMIT_TIME_WINDOW_MS`    | `60000`                 | Rate limit window in ms                             |
| `VITE_TREEMICH_API_URL`        | `/api`                  | Frontend API base URL (build-time)                  |

## Auth Model

- Users sign in to Treemich with their Immich local account credentials.
- Treemich stores a session cookie for browser auth and an encrypted Immich access token for server-to-server requests.
- All relationship and profile data is private per Treemich user.

## API Endpoints

| Method   | Path                        | Description                                |
| -------- | --------------------------- | ------------------------------------------ |
| `POST`   | `/auth/login`               | Sign in with Immich credentials            |
| `POST`   | `/auth/logout`              | End session                                |
| `GET`    | `/auth/me`                  | Current session state                      |
| `GET`    | `/auth/link-status`         | Immich link status                         |
| `GET`    | `/people`                   | List Immich people with Treemich profiles  |
| `PATCH`  | `/people/:id`               | Update person profile (gender, birth date) |
| `GET`    | `/people/:id/thumbnail`     | Person thumbnail image                     |
| `POST`   | `/people/:id/relationships` | Create a relationship                      |
| `DELETE` | `/people/:id/relationships` | Delete a relationship                      |
| `GET`    | `/relationships`            | List all relationships (paginated)         |
| `GET`    | `/people/cooccurrence`      | Photo co-occurrence data                   |
| `GET`    | `/search?q=...`             | Natural-language relationship search       |

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
