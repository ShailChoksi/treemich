# Treemich MVP

Treemich is a separate service and UI that extends Immich with family relationships and natural-language relationship queries.

## MVP Capabilities

- Keep Immich as system-of-record for photos/faces/people.
- Authenticate Treemich users by signing in with their Immich email/password.
- Persist a Treemich session cookie and a linked Immich account per user.
- Scope relationship graph + profile extensions privately per authenticated user in PostgreSQL.
- Serve a standalone web UI that signs into Treemich first, then loads the graph.
- API endpoints:
  - `POST /auth/login`
  - `POST /auth/logout`
  - `GET /auth/me`
  - `GET /auth/link-status`
  - `GET /people`
  - `PATCH /people/:id`
  - `POST /people/:id/relationships`
  - `DELETE /people/:id/relationships?toPersonId=:id&type=:type`
  - `GET /relationships`
  - `GET /people/:id/thumbnail`
  - `GET /search?q=son of Mike`
- Rule-based natural-language interpreter with a pluggable parser interface.

## Project Layout

- `apps/api`: Fastify + Prisma backend.
- `apps/web`: Vite + React frontend.
- `packages/shared`: shared types and interpreter contracts.

## Auth Model

- Treemich no longer uses a shared API key.
- Users sign in to Treemich with their Immich local account credentials.
- Treemich stores:
  - a Treemich session cookie for browser auth
  - an encrypted linked Immich access token for server-to-server Immich requests
- Relationship and profile data is private per Treemich user.

## Environment

Copy `.env.example` to `.env` and set:

- `DATABASE_URL`: PostgreSQL connection string for Treemich data.
- `IMMICH_BASE_URL`: Immich API base URL, for example `http://localhost:2283/api`.
- `TREEMICH_ENCRYPTION_KEY`: 64-character hex key used to encrypt linked Immich access tokens.
- `TREEMICH_SESSION_COOKIE_NAME`: cookie name for Treemich browser sessions.
- `TREEMICH_SESSION_TTL_MS`: Treemich session lifetime in milliseconds.
- `WEB_ORIGIN`: allowed browser origin for the Treemich web app.
- `VITE_TREEMICH_API_URL`: frontend API base URL. In dev, `/api` uses the Vite proxy.

## Quickstart

1. Copy `.env.example` to `.env`.
   - Set `IMMICH_BASE_URL` to your Immich API base URL.
   - Set `TREEMICH_ENCRYPTION_KEY` to a random 64-character hex string.
2. Start PostgreSQL:

   ```bash
   docker compose up -d postgres
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Generate the Prisma client:

   ```bash
   npm run prisma:generate -w @treemich/api
   ```

5. Apply database migrations:

   ```bash
   npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
   ```

6. Start Treemich:

   ```bash
   npm run dev
   ```

7. Open the web app and sign in with an Immich user account.

## Notes On Existing Data

- Migration `0003_add_user_scoping_and_auth` moves legacy shared relationship/profile rows onto a temporary legacy owner.
- The first real user who signs in and has no existing Treemich-scoped data will claim that legacy dataset.
- For a fresh environment, just run the migrations normally.

## Development Commands

```bash
npm run dev
npm run build
npm run lint
npm run test
```

## Docker Compose

The included `docker-compose.yml` now starts:

- `postgres` on `localhost:54321`
- `api` on `localhost:4000`
- `web` on `http://localhost:8080`

The web container proxies `/api` requests to the API container, matching the dev setup.

Before running the stack:

- Set `TREEMICH_ENCRYPTION_KEY` in `.env`.
- Set `IMMICH_BASE_URL` to a value reachable from the API container.
- If Immich runs on your host machine, prefer `http://host.docker.internal:2283/api`.
- Set `WEB_ORIGIN=http://localhost:8080` when using the compose web container.

Start the full stack with:

```bash
docker compose up --build
```

## API Examples

- `POST /auth/login`

  ```json
  {
    "email": "user@example.com",
    "password": "secret"
  }
  ```

- `GET /auth/me`

  Returns the current Treemich session state and linked-account summary.

- `POST /people/:id/relationships`

  ```json
  {
    "toPersonId": "immich-person-id",
    "relationshipType": "CHILD_OF"
  }
  ```

- `PATCH /people/:id`

  ```json
  {
    "gender": "MALE"
  }
  ```

- `DELETE /people/:id/relationships?toPersonId=immich-person-id&type=CHILD_OF`

- `GET /search?q=son%20of%20Mike`

## Verification

Before checking in changes, the main verification commands are:

```bash
npm run lint
npm run test
```
