# K-별 (K-Star) ✨

A K-culture mobile app built with **Expo / React Native** (frontend) and **NestJS** (backend).

---

## Project structure

```
K-별/
├── backend/    # NestJS REST API
└── mobile/     # Expo React Native app
```

---

## Backend (`/backend`)

Built with [NestJS](https://nestjs.com) and [Prisma](https://prisma.io), connected to a PostgreSQL database via Supabase.

### Tech stack

| Tool | Purpose |
|---|---|
| NestJS 11 | REST API framework |
| Prisma 7 | ORM |
| PostgreSQL (Supabase) | Database |
| JWT | Authentication |
| bcrypt | Password hashing |
| class-validator | Request validation |

### Get started

```bash
cd backend

# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env
# Then fill in your values in .env

# 3. Run database migrations
npx prisma migrate dev

# 4. Start the server
npm run start:dev
```

The API will be available at `http://localhost:3000`.

### API endpoints

#### Authentication

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

**Validation rules:**
- Email must be a valid email format
- Password must be at least 8 characters

**Error responses:**

| Status | Condition |
|---|---|
| 400 | Invalid input |
| 401 | Wrong credentials |
| 409 | Email or username already in use |

### Database schema

**User**

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| email | String | Unique |
| username | String | Unique |
| password | String | bcrypt hashed |
| created_at | DateTime | Auto-generated |

### Scripts

| Script | Description |
|---|---|
| `npm run start:dev` | Start in watch mode |
| `npm run build` | Compile TypeScript |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run lint` | Lint and auto-fix |

---

## Mobile (`/mobile`)

Built with [Expo](https://expo.dev) using file-based routing via Expo Router.

### Tech stack

| Tool | Purpose |
|---|---|
| Expo Router | File-based navigation |
| React Native Reanimated v4 | Smooth animations |
| expo-blur | Glassmorphism UI |
| expo-secure-store | JWT persistence |
| Zustand | Auth state management |
| expo-image | SVG / image rendering |

### Get started

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

> ⚠️ **Expo Go is limited.** Social login (Google / Apple) and other native
> modules (`expo-apple-authentication`, custom-scheme OAuth redirects) **do not
> run in Expo Go** — you need a **development build** (see below).

### Development build (required for social login)

Google/Apple sign-in and native modules require a custom dev client built with
[EAS](https://docs.expo.dev/develop/development-builds/introduction/).

**One-time setup**

```bash
cd mobile
npx eas login          # free Expo account
npx eas init           # links the project (writes extra.eas.projectId to app.json)
```

**Build the dev client**

```bash
# Android — produces an installable APK
npx eas build --profile development --platform android

# iOS — needs an Apple Developer account
npx eas device:create                                  # register your iPhone (open the link on the device)
npx eas build --profile development --platform ios     # EAS handles signing; log in with your Apple ID
```

Builds run in the Expo cloud (~10–20 min) and return a QR/link to install.

**Run against the dev build**

```bash
npx expo start --dev-client
```

Open the **installed dev build** (not Expo Go) and connect to Metro.

**Gotchas**
- iOS 16+ requires **Developer Mode** on the device: *Settings → Privacy &
  Security → Developer Mode → On* (then restart).
- The device must be on the **same Wi-Fi** as your machine, and the **backend
  must be running** (`cd backend && npm run start`) so the app can reach the API.
- Emulators often have **no network** — prefer a physical device for OAuth.
- Build profiles live in [`mobile/eas.json`](mobile/eas.json).

### Environment variables (`mobile/.env`)

```ini
# Supabase anon key — used for social-login OAuth (public, safe to ship)
EXPO_PUBLIC_SUPABASE_ANON_KEY="<your-supabase-anon-key>"
```

### Folder structure

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

### Fonts

Custom fonts stored in `mobile/assets/fonts/`:
- **Cafe24 Syongsyong** — buttons, inputs
- **Cafe24 Moyamoya** — titles, labels

---

## Mobile ↔ Backend connection

The mobile app resolves the API URL automatically based on the platform (`mobile/constants/api.ts`):

| Environment | URL |
|---|---|
| Android emulator | `http://10.0.2.2:3000` |
| iOS simulator / web | `http://localhost:3000` |
| Production | Set your deployed URL in `api.ts` |

---

## License

Private project — B3 Fil Rouge.
