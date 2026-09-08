# K-별 — Backend

NestJS REST API for the K-별 (K-Star) mobile app.

## Tech stack

| Tool | Purpose |
|---|---|
| NestJS 11 | REST API framework |
| Prisma 7 | ORM |
| PostgreSQL (Supabase) | Database |
| JWT | Authentication |
| bcrypt | Password hashing |
| class-validator | Request validation |

## Get started

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env
# Fill in your values in .env

# 3. Run database migrations
npx prisma migrate dev

# 4. Start in watch mode
npm run start:dev
```

The API runs on `http://localhost:3000` by default.

## Environment variables

See [`.env.example`](.env.example) for all required variables.

## API documentation

Swagger UI at [`/api-docs`](http://localhost:3000/api-docs), the raw spec at
`/api-docs-json`: 52 operations across 11 tags, generated from the code rather
than written beside it. Sign in through `POST /auth/login`, paste the
`access_token` into **Authorize**, and every guarded route becomes callable
from the page.

Request and response shapes come from the DTOs themselves — the Swagger CLI
plugin is enabled in `nest-cli.json`, so a field added to a DTO documents
itself and one removed stops being documented.

**It is not open.** A spec is a complete map of every route, parameter and
error shape, and #63 was about not handing out what the API does not need to
give away — so `SWAGGER_USER` and `SWAGGER_PASSWORD` put it behind basic auth.
Leave them unset and the docs are open in development and **not served at all**
in production, failing closed the way `JWT_SECRET` and `DATABASE_CA_CERT` do.

One thing to know if you touch the guard: it is registered in `main.ts`
alongside helmet, not next to the routes it protects. Middleware added later in
the boot sequence never runs against them, because `SwaggerModule` has already
bound a handler that answers first.

The chat is absent by nature: it runs over socket.io on this same origin, and
OpenAPI has no way to describe WebSocket events.

## API endpoints

The tables below cover what the generated spec cannot: why a route behaves the
way it does. For the shapes themselves, read `/api-docs`.

### Authentication

| Method | Route | Description | Body |
|---|---|---|---|
| POST | `/auth/register` | Create a new account | `{ email, username, password }` |
| POST | `/auth/login` | Sign in, returns a JWT | `{ email, password }` |

**Success response:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Error responses:**

| Status | Condition |
|---|---|
| 400 | Invalid input |
| 401 | Wrong credentials |
| 409 | Email or username already in use |

### Account

Both routes act on the caller and take no id — there is no number in the path
to point at somebody else's account.

| Method | Route | Description | Body |
|---|---|---|---|
| DELETE | `/me` | Delete the current account | `{ password }`, or `{ accessToken }` for a Google / Apple account |
| GET | `/me/export` | Everything the account holds, as a JSON attachment | — |

Which proof `DELETE /me` accepts follows from the account, not from what the
caller sends: a social account holds a random password minted at signup that
its owner has never seen, so it re-authenticates with its provider instead.

#### What deletion does

**It destroys nothing.** `deleted_at` alone hides the account and everything it
owns, which is what lets a reactivation inside the grace period give it all back
as it was rather than as a shell. Deleting is one `UPDATE`.

| | |
|---|---|
| Hidden, untouched | organised events (and their group chats), participations, conversation memberships, preferences, follows, blocks, devices |
| Emptied | email, username, avatar, bio — parked in `restore_email` / `restore_username` / `restore_avatar` / `restore_bio` |
| Destroyed | pending password-reset codes, which would otherwise be a way in that skips reactivation |

Nothing had to learn about deletion twice: `ModerationService.hiddenUserIds`
already answered "every user id this viewer should no longer see", so deleted
accounts joined that list and every read that knew how to hide a blocked person
now hides a departed one. The exceptions are the reads that had no reason to
consult it — follower counters, an event's detail and its join route, and the
push sender — which check `deletedAt` themselves.

The email is freed in the same transaction, so **the same address can open a
new account the very next minute**. Signing in is refused from that moment: the
address no longer resolves to the row, `AuthService.login` rules out a deleted
account explicitly, and `JwtAuthGuard` rejects tokens belonging to one — which
matters, because tokens live seven days and there is no revocation list.

#### Grace period

Thirty days (`GRACE_PERIOD_DAYS` in `account.service.ts`). Nothing the user can
see changes during it — the account and its contents went dark the moment they
confirmed. What the window holds open is the possibility of undoing all of it.

`AccountPurgeService` closes it nightly, and that is where a deletion finally
becomes one: the events, participations, memberships, follows, blocks,
preferences and devices are destroyed for real, the restore columns are cleared,
and the password hash is replaced with one nobody holds the input to.

Reactivating means moving the four restore columns back and clearing
`deleted_at` — everything hidden becomes visible again in the same motion,
because it never went anywhere.

| Method | Route | Description | Body |
|---|---|---|---|
| POST | `/auth/reactivate` | Emails a code, or brings a social account straight back | `{ email, password }` or `{ email, accessToken }` |
| POST | `/auth/reactivate/confirm` | Finishes it, returns a JWT | `{ email, code }` |

Users do not go looking for these. Signing in with a deleted account's
credentials answers **409** carrying a `reactivation` object instead of the
usual 401, and the app turns that into an offer — which is also why the
password is checked before the offer is made: without that, typing an address
would reveal whether it ever belonged to anyone.

A social account never sees a code. Its provider has just vouched for the
address, which is the same proof the emailed code exists to obtain.

Reactivation only works while the address is still free. The email is released
at deletion so a new account can take it, and whoever takes it wins — the
attempt then answers 409 and says so. A taken *username* is not fatal: the
account comes back under a suffixed one.

Messages and reports outlive even the purge. `messages.sender_id` is not
nullable and those messages belong to conversations other people are still
reading; reports are about somebody else's behaviour, and moderation would lose
the trail.

## Scripts

| Script | Description |
|---|---|
| `npm run start:dev` | Start in watch mode |
| `npm run start:prod` | Start compiled build |
| `npm run build` | Compile TypeScript |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run lint` | Lint and auto-fix |

## Deployment (Railway)

[`railway.json`](railway.json) holds the build, migration and start commands, so
the only thing that has to be clicked in the dashboard is the service itself.

**Set the service's Root Directory to `backend`.** This is a monorepo; without
it Railway builds from the repository root and finds no `package.json`.

The pipeline it describes:

| Phase | Command | Why |
|---|---|---|
| install | `npm ci` (Nixpacks) | `postinstall` runs `prisma generate` — the client isn't in the repo |
| build | `npm run build` | compiles to `dist/` |
| pre-deploy | `npx prisma migrate deploy` | applies pending migrations before the new version takes traffic |
| start | `npm run start:prod` | `node dist/main` |

Health checks hit `/`, which `AppController` answers without touching the
database — so a failing health check means the process is down, not the DB.

### Variables to set on the service

`PORT` is injected by Railway; don't define it. Everything else comes from
[`.env.example`](.env.example), which documents each one in full:

| Variable | Notes |
|---|---|
| `JWT_SECRET` | ≥ 32 chars, generated for production — never the local one |
| `DATABASE_URL` | pooled connection (PgBouncer) |
| `DIRECT_URL` | direct connection, used by `migrate deploy` |
| `DATABASE_CA_CERT` | see below |
| `NODE_ENV` | `production` |
| `CORS_ORIGINS` | only needed if the Expo **web** build is deployed |
| `RESEND_API_KEY`, `MAIL_FROM` | sender domain must be verified in Resend |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | social login token validation |
| `EXPO_ACCESS_TOKEN` | optional, only for Expo's enhanced push security |

### Three things that bite on the first deploy

**The Node version has to be pinned.** Nixpacks defaults to Node 18, and
Prisma 7 refuses to install on anything below 20.19 — the build dies in
`npm ci`, before a single line of this project is compiled. `engines.node` in
`package.json` and [`.nvmrc`](.nvmrc) both say 22, the same version CI runs.

**`DATABASE_CA_CERT` is effectively mandatory in production.** With
`NODE_ENV=production` and no CA, `PrismaService` verifies the database TLS chain
against the system trust store and fails closed — the app boots and then dies on
the first query. Paste the provider's CA (Supabase → Project Settings →
Database → SSL configuration) as the variable's value, PEM contents and all.

**Dev dependencies must survive the install.** `nest build` comes from
`@nestjs/cli`, a dev dependency, and `NODE_ENV=production` tells npm to skip
those. Nixpacks normally forces `NPM_CONFIG_PRODUCTION=false` for the install
phase; if the build fails on `nest: not found`, set `NPM_CONFIG_INCLUDE=dev` on
the service.

### After the first deploy

1. Generate a public domain for the service.
2. Seed the database if it's empty — `npm run prisma:seed`, from the Railway
   shell or against `DIRECT_URL` locally.
3. Put the domain in [`mobile/constants/api.ts`](../mobile/constants/api.ts),
   which still ships a placeholder production URL. It is baked in at build
   time, so this has to happen before any EAS production build.
