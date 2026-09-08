# K-별 — Mobile

Expo SDK 54 / React Native client for the K-별 app.

## Get started

```bash
npm install
cp .env.example .env   # then fill in EXPO_PUBLIC_SUPABASE_ANON_KEY
npx expo start
```

The API URL resolves itself: on a device it takes the host from Expo's dev
server and talks to port 3000 on your machine, so `npm run start:dev` has to be
running in `backend/`. A production build reaches the deployed API instead —
that URL is baked in at compile time, in [`constants/api.ts`](constants/api.ts).

## Quality gates

```bash
npx expo lint && npm run typecheck
npm test
```

Business logic that deserves tests goes in [`utils/`](utils), not inside a
component — `utils/event-filters.ts` was pulled out of `event-filter-sheet.tsx`
for exactly that reason and is re-exported from it so imports stay put.

## iOS release (TestFlight)

### What the repository already handles

| | |
|---|---|
| Bundle identifier | `com.kbyeol.app`, in `app.json` |
| Sign in with Apple | declared via `usesAppleSignIn` |
| Encryption declaration | `ITSAppUsesNonExemptEncryption: false` — skips the export-compliance question on every upload |
| Version numbers | `appVersionSource: remote` + `autoIncrement`, so EAS owns the build number and no two uploads collide |
| Permissions | one string, for the photo library, worded for what the app actually does with it |
| API URL | the Railway deployment, in `constants/api.ts` |

**Permissions are deliberately minimal.** iOS review reads purpose strings, and
a permission the app never asks for is worse than a missing one. The camera is
never opened — only the photo library — so `expo-image-picker` is configured
with `cameraPermission: false`. `expo-location` was removed outright: nothing
imported it, and its mere presence injected three location strings including
`NSLocationAlwaysUsageDescription`, background location, with Expo's default
"Allow $(PRODUCT_NAME) to access your location" as the justification.

### What has to be done from an Apple account

None of this can live in the repository.

1. **Apple Developer Program membership** (99 €/year). Nothing below works
   without it.
2. **Create the app in App Store Connect** against `com.kbyeol.app`, and note
   its Apple ID (`ascAppId`) and your Team ID.
3. **Enable Sign in with Apple** on the App ID. The app offers Google sign-in,
   which makes Apple's own a requirement rather than a nicety.
4. **Credentials**: `eas credentials` generates and stores the distribution
   certificate, the provisioning profile and the **APNs key** for push (#36).
   Let EAS manage them unless you have a reason not to.
5. **Build secrets**: `.env` is not committed, so the build servers do not have
   it. `EXPO_PUBLIC_SUPABASE_ANON_KEY` has to exist as an EAS environment
   variable, or social sign-in throws on first use in the built app.

### Building and submitting

```bash
eas build --profile production --platform ios
eas submit --profile production --platform ios
```

`eas submit` asks for the Apple ID, the app's Apple ID and the Team ID the
first time. They are deliberately not committed here: they identify a person
and an organisation, and this repository is not the place for either.

Then, in App Store Connect: add internal testers to a TestFlight group. Up to
100 of them, no review. External testers go through Beta App Review, which
takes a few days.

### Before the first submission

- **A verified sender domain in Resend.** With `onboarding@resend.dev` only
  your own address receives anything, so email verification, password reset and
  account reactivation all fail silently for every tester.
- **A privacy policy URL**, and the App Privacy questionnaire. The app collects
  an email, a location for events, photos and messages.
- **A 1024×1024 icon with no alpha channel.** Apple rejects transparency.
