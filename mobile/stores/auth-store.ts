import { create } from "zustand";
import { API_URL } from "@/constants/api";
import {
  releaseSupabaseSession,
  requestSupabaseAccessToken,
} from "@/utils/social-auth";
import { getItem, setItem, deleteItem } from "@/utils/storage";
import {
  registerPushToken,
  unregisterPushToken,
} from "@/utils/push-notifications";
import { useOnboardingStore } from "@/stores/onboarding-store";

// Maps raw class-validator messages to user-friendly ones
const VALIDATION_MAP: Record<string, string> = {
  "username must be longer than or equal to 2 characters":
    "Your username needs at least 2 characters",
  "username must be shorter than or equal to 50 characters":
    "Keep your username under 50 characters",
  "username should not be empty": "Don't leave your username blank",
  "username must be a string": "That username doesn't look right",
  "email must be an email": "That email doesn't look right",
  "email should not be empty": "Don't forget your email",
  "password must be longer than or equal to 8 characters":
    "Your password needs at least 8 characters",
  "password should not be empty": "Don't leave your password empty",
  "password must be a string": "That password doesn't look right",
};

function parseValidationErrors(messages: string[]): string {
  return messages.map((m) => `• ${VALIDATION_MAP[m] ?? m}`).join("\n");
}

const JWT_KEY = "kbyeol_jwt";
const ONBOARDING_KEY = "kbyeol_onboarding_done";
const EMAIL_VERIFIED_KEY = "kbyeol_email_verified";
const USERNAME_KEY = "kbyeol_username";
const EMAIL_KEY = "kbyeol_email";
const PROVIDER_KEY = "kbyeol_provider";

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  isNewUser: boolean;
  hasCompletedOnboarding: boolean;
  emailVerified: boolean;
  username: string | null;
  email: string | null;
  /**
   * How this account authenticates: "email", "google" or "apple". The settings
   * screen reads it to decide what proof deleting the account should ask for —
   * a social account has no password its owner has ever seen.
   */
  provider: string | null;
  isLoading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (username: string, email: string, password: string) => Promise<void>;
  socialSignIn: (provider: "google" | "apple") => Promise<boolean>;
  forgotPassword: (email: string) => Promise<boolean>;
  verifyResetCode: (code: string) => Promise<boolean>;
  resetPassword: (token: string, password: string) => Promise<boolean>;
  verifyEmail: (code: string) => Promise<boolean>;
  resendVerification: () => Promise<"sent" | "already-verified" | "error">;
  signOut: () => Promise<void>;
  setOnboardingComplete: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  isAuthenticated: false,
  isNewUser: false,
  hasCompletedOnboarding: false,
  emailVerified: false,
  username: null,
  email: null,
  provider: null,
  isLoading: false,
  error: null,

  hydrate: async () => {
    try {
      const token = await getItem(JWT_KEY);
      const onboardingDone = await getItem(ONBOARDING_KEY);
      const emailVerified = await getItem(EMAIL_VERIFIED_KEY);
      const username = await getItem(USERNAME_KEY);
      const email = await getItem(EMAIL_KEY);
      const provider = await getItem(PROVIDER_KEY);
      if (token) {
        set({
          token,
          isAuthenticated: true,
          hasCompletedOnboarding: onboardingDone === "true",
          emailVerified: emailVerified === "true",
          username,
          email,
          provider,
        });
        // Expo can rotate a device's push token between launches.
        void registerPushToken(token);
      }
    } catch {
      // Token not found or unreadable — stay unauthenticated
    }
  },

  signIn: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (res.status === 401) {
        set({
          error:
            "Close, but not quite — check your details and try again.",
          isLoading: false,
        });
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("[signIn] Error response →", res.status, body);
        set({
          error: "Hmm… something’s off. Try again.",
          isLoading: false,
        });
        return;
      }

      const data = await res.json();
      await setItem(JWT_KEY, data.access_token);
      const emailVerified = data.emailVerified === true;
      await setItem(
        EMAIL_VERIFIED_KEY,
        emailVerified ? "true" : "false",
      );
      const username = data.username ?? null;
      const emailAddr = data.email ?? email;
      const provider = data.provider ?? "email";
      if (username) await setItem(USERNAME_KEY, username);
      if (emailAddr) await setItem(EMAIL_KEY, emailAddr);
      await setItem(PROVIDER_KEY, provider);
      set({
        token: data.access_token,
        isAuthenticated: true,
        isNewUser: false,
        emailVerified,
        username,
        email: emailAddr,
        provider,
        isLoading: false,
      });
      // Fire-and-forget: the OS permission prompt must not hold up sign-in.
      void registerPushToken(data.access_token);
    } catch (e) {
      console.error("[signIn] Network error →", `${API_URL}/auth/login`, e);
      set({
        error: "Can't reach the server right now. Check your connection.",
        isLoading: false,
      });
    }
  },

  signUp: async (username: string, email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      if (res.status === 400) {
        const body = await res.json().catch(() => ({}));
        const messages: string[] = Array.isArray(body.message)
          ? body.message
          : [body.message];
        set({ error: parseValidationErrors(messages), isLoading: false });
        return;
      }
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        const msg: string = body.message ?? "";
        const error = msg.toLowerCase().includes("username")
          ? "That username's already taken — try another one."
          : "An account already exists with this email — try logging in.";
        set({ error, isLoading: false });
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("[signUp] Error response →", res.status, body);
        set({
          error: "Hmm… something’s off. Try again.",
          isLoading: false,
        });
        return;
      }

      const data = await res.json();
      await setItem(JWT_KEY, data.access_token);
      // New accounts start unverified.
      await setItem(EMAIL_VERIFIED_KEY, "false");
      await setItem(USERNAME_KEY, data.username ?? username);
      await setItem(EMAIL_KEY, data.email ?? email);
      // Signing up here is always a password account; social accounts are
      // created by the /auth/social route instead.
      await setItem(PROVIDER_KEY, data.provider ?? "email");
      set({
        token: data.access_token,
        isAuthenticated: true,
        isNewUser: true,
        emailVerified: false,
        username: data.username ?? username,
        email: data.email ?? email,
        provider: data.provider ?? "email",
        isLoading: false,
      });
      void registerPushToken(data.access_token);
    } catch (e) {
      console.error("[signUp] Network error →", `${API_URL}/auth/register`, e);
      set({
        error: "Can't reach the server right now. Check your connection.",
        isLoading: false,
      });
    }
  },

  socialSignIn: async (provider: "google" | "apple") => {
    set({ isLoading: true, error: null });
    try {
      const social = await requestSupabaseAccessToken(provider);
      if (social.status === "cancelled") {
        set({ isLoading: false }); // user dismissed the provider's sheet
        return false;
      }
      if (social.status === "error") {
        set({ error: social.message, isLoading: false });
        return false;
      }
      const supabaseToken = social.accessToken;

      // Bridge the Supabase token to our backend for an app JWT.
      const res = await fetch(`${API_URL}/auth/social`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, accessToken: supabaseToken }),
      });

      if (res.status === 409) {
        set({
          error:
            "An account with this email already exists. Log in with your email and password instead.",
          isLoading: false,
        });
        return false;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("[socialSignIn] Error response →", res.status, body);
        set({ error: "Hmm… something’s off. Try again.", isLoading: false });
        return false;
      }

      const appData = await res.json();

      // The backend has validated the token, so the Supabase session has done
      // its job and is dropped locally.
      await releaseSupabaseSession();

      await setItem(JWT_KEY, appData.access_token);
      await setItem(EMAIL_VERIFIED_KEY, "true");
      if (appData.username)
        await setItem(USERNAME_KEY, appData.username);
      if (appData.email)
        await setItem(EMAIL_KEY, appData.email);
      await setItem(PROVIDER_KEY, appData.provider ?? provider);
      set({
        token: appData.access_token,
        isAuthenticated: true,
        isNewUser: appData.isNewUser === true,
        emailVerified: true,
        username: appData.username ?? null,
        email: appData.email ?? null,
        provider: appData.provider ?? provider,
        isLoading: false,
      });
      void registerPushToken(appData.access_token);
      return true;
    } catch (e) {
      // User tapped "Cancel" on the native Apple sheet → not an error.
      if ((e as { code?: string })?.code === "ERR_REQUEST_CANCELED") {
        set({ isLoading: false });
        return false;
      }
      console.error("[socialSignIn] error →", e);
      set({
        error: "Can't reach the server right now. Check your connection.",
        isLoading: false,
      });
      return false;
    }
  },

  forgotPassword: async (email: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.status === 400) {
        const body = await res.json().catch(() => ({}));
        const messages: string[] = Array.isArray(body.message)
          ? body.message
          : [body.message];
        set({ error: parseValidationErrors(messages), isLoading: false });
        return false;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("[forgotPassword] Error response →", res.status, body);
        set({ error: "Hmm… something’s off. Try again.", isLoading: false });
        return false;
      }

      // The backend always returns a generic success (no account enumeration).
      set({ isLoading: false });
      return true;
    } catch (e) {
      console.error(
        "[forgotPassword] Network error →",
        `${API_URL}/auth/forgot-password`,
        e,
      );
      set({
        error: "Can't reach the server right now. Check your connection.",
        isLoading: false,
      });
      return false;
    }
  },

  verifyResetCode: async (code: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_URL}/auth/verify-reset-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: code }),
      });

      if (res.status === 400) {
        const body = await res.json().catch(() => ({}));
        const messages: string[] = Array.isArray(body.message)
          ? body.message
          : [body.message];
        const friendly = messages
          .map((m) => VALIDATION_MAP[m] ?? m)
          .join("\n");
        set({ error: friendly, isLoading: false });
        return false;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("[verifyResetCode] Error response →", res.status, body);
        set({ error: "Hmm… something’s off. Try again.", isLoading: false });
        return false;
      }

      set({ isLoading: false });
      return true;
    } catch (e) {
      console.error(
        "[verifyResetCode] Network error →",
        `${API_URL}/auth/verify-reset-code`,
        e,
      );
      set({
        error: "Can't reach the server right now. Check your connection.",
        isLoading: false,
      });
      return false;
    }
  },

  resetPassword: async (token: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (res.status === 400) {
        const body = await res.json().catch(() => ({}));
        const messages: string[] = Array.isArray(body.message)
          ? body.message
          : [body.message];
        // Token problems come back as a single human-readable string; password
        // rules come back as class-validator messages we already know how to map.
        const friendly = messages
          .map((m) => VALIDATION_MAP[m] ?? m)
          .join("\n");
        set({ error: friendly, isLoading: false });
        return false;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("[resetPassword] Error response →", res.status, body);
        set({ error: "Hmm… something’s off. Try again.", isLoading: false });
        return false;
      }

      set({ isLoading: false });
      return true;
    } catch (e) {
      console.error(
        "[resetPassword] Network error →",
        `${API_URL}/auth/reset-password`,
        e,
      );
      set({
        error: "Can't reach the server right now. Check your connection.",
        isLoading: false,
      });
      return false;
    }
  },

  verifyEmail: async (code: string) => {
    const { token } = get();
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_URL}/auth/verify-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      });

      if (res.status === 400) {
        const body = await res.json().catch(() => ({}));
        const messages: string[] = Array.isArray(body.message)
          ? body.message
          : [body.message];
        set({
          error: messages.map((m) => VALIDATION_MAP[m] ?? m).join("\n"),
          isLoading: false,
        });
        return false;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("[verifyEmail] Error response →", res.status, body);
        set({ error: "Hmm… something’s off. Try again.", isLoading: false });
        return false;
      }

      await setItem(EMAIL_VERIFIED_KEY, "true");
      set({ emailVerified: true, isLoading: false });
      return true;
    } catch (e) {
      console.error(
        "[verifyEmail] Network error →",
        `${API_URL}/auth/verify-email`,
        e,
      );
      set({
        error: "Can't reach the server right now. Check your connection.",
        isLoading: false,
      });
      return false;
    }
  },

  resendVerification: async () => {
    const { token } = get();
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_URL}/auth/resend-verification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("[resendVerification] Error response →", res.status, body);
        set({ error: "Hmm… something’s off. Try again.", isLoading: false });
        return "error";
      }
      const body = await res.json().catch(() => ({}));
      if (body.alreadyVerified === true) {
        // Sync local state — the account is already verified.
        await setItem(EMAIL_VERIFIED_KEY, "true");
        set({ emailVerified: true, isLoading: false });
        return "already-verified";
      }
      set({ isLoading: false });
      return "sent";
    } catch (e) {
      console.error(
        "[resendVerification] Network error →",
        `${API_URL}/auth/resend-verification`,
        e,
      );
      set({
        error: "Can't reach the server right now. Check your connection.",
        isLoading: false,
      });
      return "error";
    }
  },

  signOut: async () => {
    // Detach this device before the JWT goes away — the call needs it.
    await unregisterPushToken(get().token);
    await deleteItem(JWT_KEY);
    await deleteItem(ONBOARDING_KEY);
    await deleteItem(EMAIL_VERIFIED_KEY);
    await deleteItem(USERNAME_KEY);
    await deleteItem(EMAIL_KEY);
    await deleteItem(PROVIDER_KEY);
    useOnboardingStore.getState().reset();
    set({ token: null, isAuthenticated: false, isNewUser: false, hasCompletedOnboarding: false, emailVerified: false, username: null, email: null, provider: null, error: null });
  },

  setOnboardingComplete: async () => {
    await setItem(ONBOARDING_KEY, "true");
    set({ hasCompletedOnboarding: true, isNewUser: false });
  },

  clearError: () => set({ error: null }),
}));
