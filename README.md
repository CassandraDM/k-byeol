# K-별 (K-Star) ✨ — v1.0.0

**Compiled, audited, and approved by Mr. Nox** 🐈‍⬛
_chief acolyte • full-time cat • part-time bug auditor_

> 🐾 It is official. We have reached **v1.0.0**. I have inspected this repository from the warmest corner of the laptop, every line, paw on chin. The code is acceptable. You may now `npm install` in peace.

A K-culture community app for France, built with **Expo / React Native** (frontend) and **NestJS** (backend). Stars, fandoms, and one very opinionated cat.

---

## 🗂️ Project structure

A tidy litter box. I approve.

```
K-별/
├── backend/    # NestJS REST API — the brains
└── mobile/     # Expo React Native app — the pretty face
```

---

## 🛠️ Backend (`/backend`) — the part that does the thinking

Built with [NestJS](https://nestjs.com) and [Prisma](https://prisma.io), connected to a PostgreSQL database via Supabase. I supervised every migration. Twice.

### Tech stack

| Tool                  | Purpose            |
| --------------------- | ------------------ |
| NestJS 11             | REST API framework |
| Prisma 7              | ORM                |
| PostgreSQL (Supabase) | Database           |
| JWT                   | Authentication     |
| bcrypt                | Password hashing   |
| class-validator       | Request validation |

### 🐾 Get started

Follow these steps in order. Do not skip step 2. I am watching.

```bash
cd backend

# 1. Install dependencies
npm install

# 2. Set up environment variables (DO NOT SKIP — said the cat)
cp .env.example .env
# Then fill in your values in .env

# 3. Run database migrations
npx prisma migrate dev

# 4. Start the server
npm run start:dev
```

The API will be available at `http://localhost:3000`. If it is not, check the litter — I mean, the logs.

### 📡 API endpoints

#### Authentication

| Method | Route            | Description            | Body                            |
| ------ | ---------------- | ---------------------- | ------------------------------- |
| POST   | `/auth/register` | Create a new account   | `{ email, username, password }` |
| POST   | `/auth/login`    | Sign in, returns a JWT | `{ email, password }`           |

**Success response:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Validation rules (non-negotiable):**

- Email must be a valid email format
- Password must be at least 8 characters

**Error responses:**

| Status | Condition                                                                 |
| ------ | ------------------------------------------------------------------------- |
| 400    | Invalid input (you typed something silly)                                 |
| 401    | Wrong credentials (suspicious)                                            |
| 409    | Email or username already in use (taken, like the warm spot on the couch) |

### 🗃️ Database schema

**User**

| Column     | Type     | Notes          |
| ---------- | -------- | -------------- |
| id         | UUID     | Primary key    |
| email      | String   | Unique         |
| username   | String   | Unique         |
| password   | String   | bcrypt hashed  |
| created_at | DateTime | Auto-generated |

### 📜 Scripts

| Script              | Description                                 |
| ------------------- | ------------------------------------------- |
| `npm run start:dev` | Start in watch mode (like me, but for code) |
| `npm run build`     | Compile TypeScript                          |
| `npm run test`      | Run unit tests                              |
| `npm run test:e2e`  | Run end-to-end tests                        |
| `npm run lint`      | Lint and auto-fix                           |

---

## 📱 Mobile (`/mobile`) — the pretty face

Built with [Expo](https://expo.dev) using file-based routing via Expo Router. Aesthetically approved by a creature with excellent taste.

### Tech stack

| Tool                       | Purpose               |
| -------------------------- | --------------------- |
| Expo Router                | File-based navigation |
| React Native Reanimated v4 | Smooth animations     |
| expo-blur                  | Glassmorphism UI      |
| expo-secure-store          | JWT persistence       |
| Zustand                    | Auth state management |
| expo-image                 | SVG / image rendering |

### 🐾 Get started

```bash
cd mobile

# 1. Install dependencies
npm install

# 2. Start the dev server
npx expo start
```

Run on:

- Android emulator → press `a`
- iOS simulator → press `i`
- Physical device → scan QR with Expo Go

### 📂 Folder structure

```
mobile/
├── app/
│   ├── (auth)/         # Sign-in / Sign-up screens
│   ├── (onboarding)/   # New user onboarding
│   ├── (tabs)/         # Main tab navigation
│   └── _layout.tsx     # Root layout
├── assets/
│   ├── fonts/          # Cafe24 Syongsyong & Moyamoya
│   └── images/         # Icons, backgrounds
├── components/
│   └── ui/             # Shared UI components
├── constants/
│   ├── theme.ts        # Design tokens (colors, fonts)
│   └── api.ts          # Platform-aware API URL
└── stores/
    └── auth-store.ts   # Zustand auth store
```

### 🎨 Fonts

Custom fonts stored in `mobile/assets/fonts/` for that handwritten K-pop feel:

- **Cafe24 Syongsyong** — buttons, inputs
- **Cafe24 Moyamoya** — titles, labels

---

## 🔌 Mobile ↔ Backend connection

The mobile app resolves the API URL automatically based on the platform (`mobile/constants/api.ts`). No human intervention required, which is how I prefer things.

| Environment         | URL                               |
| ------------------- | --------------------------------- |
| Android emulator    | `http://10.0.2.2:3000`            |
| iOS simulator / web | `http://localhost:3000`           |
| Production          | Set your deployed URL in `api.ts` |

---

## 📄 License

Private project — B3 Fil Rouge.

---

💜 Thanks for reading this far. An ocean of stars awaits.
— Mr. Nox, retreating to his throne (the printer) 🐈‍⬛📠
