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

## API endpoints

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

## Scripts

| Script | Description |
|---|---|
| `npm run start:dev` | Start in watch mode |
| `npm run start:prod` | Start compiled build |
| `npm run build` | Compile TypeScript |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run lint` | Lint and auto-fix |
