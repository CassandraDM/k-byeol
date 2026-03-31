# K-별

A full-stack application with a NestJS backend and Expo (React Native) mobile frontend.

## Project Structure

```
K-별/
├── backend/          # NestJS REST API
├── mobile/           # Expo React Native app
```

## Backend

### Tech Stack

- **Framework:** NestJS 11
- **Database:** PostgreSQL (Supabase)
- **ORM:** Prisma 7
- **Auth:** JWT (JSON Web Tokens)
- **Validation:** class-validator

### Getting Started

```bash
cd backend
npm install
```

Set up your `.env` file:

```env
DATABASE_URL="your-supabase-connection-string"
JWT_SECRET="your-secret-key"
```

Run database migrations:

```bash
npx prisma migrate dev
```

Start the server:

```bash
npm run start:dev
```

The API runs on `http://localhost:3000` by default.

### API Endpoints

#### Authentication

| Method | Endpoint         | Description              | Body                              |
|--------|------------------|--------------------------|-----------------------------------|
| POST   | `/auth/register` | Register a new user      | `{ "email": "...", "password": "..." }` |
| POST   | `/auth/login`    | Login with credentials   | `{ "email": "...", "password": "..." }` |

**Register/Login Response:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Validation Rules:**
- Email must be a valid email format
- Password must be at least 8 characters

**Error Responses:**

| Status | Condition              |
|--------|------------------------|
| 400    | Invalid input          |
| 401    | Wrong credentials      |
| 409    | Email already in use   |

### Database Schema

**User**

| Column     | Type     | Notes                  |
|------------|----------|------------------------|
| id         | UUID     | Primary key            |
| email      | String   | Unique                 |
| password   | String   | bcrypt hashed          |
| created_at | DateTime | Auto-generated         |

## Mobile

### Tech Stack

- **Framework:** Expo (React Native)
- **Routing:** File-based routing (Expo Router)

### Getting Started

```bash
cd mobile
npm install
npx expo start
```

## Scripts

### Backend

| Script              | Description                |
|---------------------|----------------------------|
| `npm run start:dev` | Start in watch mode        |
| `npm run build`     | Compile TypeScript         |
| `npm run test`      | Run unit tests             |
| `npm run test:e2e`  | Run end-to-end tests       |
| `npm run lint`      | Lint and auto-fix          |
