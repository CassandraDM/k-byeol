import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "@/constants/api";
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

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  isNewUser: boolean;
  hasCompletedOnboarding: boolean;
  isLoading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (username: string, email: string, password: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<boolean>;
  verifyResetCode: (code: string) => Promise<boolean>;
  resetPassword: (token: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  setOnboardingComplete: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  isAuthenticated: false,
  isNewUser: false,
  hasCompletedOnboarding: false,
  isLoading: false,
  error: null,

  hydrate: async () => {
    try {
      const token = await SecureStore.getItemAsync(JWT_KEY);
      const onboardingDone = await SecureStore.getItemAsync(ONBOARDING_KEY);
      if (token) {
        set({
          token,
          isAuthenticated: true,
          hasCompletedOnboarding: onboardingDone === "true",
        });
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
      await SecureStore.setItemAsync(JWT_KEY, data.access_token);
      set({
        token: data.access_token,
        isAuthenticated: true,
        isNewUser: false,
        isLoading: false,
      });
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
      await SecureStore.setItemAsync(JWT_KEY, data.access_token);
      set({
        token: data.access_token,
        isAuthenticated: true,
        isNewUser: true,
        isLoading: false,
      });
    } catch (e) {
      console.error("[signUp] Network error →", `${API_URL}/auth/register`, e);
      set({
        error: "Can't reach the server right now. Check your connection.",
        isLoading: false,
      });
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

  signOut: async () => {
    await SecureStore.deleteItemAsync(JWT_KEY);
    await SecureStore.deleteItemAsync(ONBOARDING_KEY);
    useOnboardingStore.getState().reset();
    set({ token: null, isAuthenticated: false, isNewUser: false, hasCompletedOnboarding: false, error: null });
  },

  setOnboardingComplete: async () => {
    await SecureStore.setItemAsync(ONBOARDING_KEY, "true");
    set({ hasCompletedOnboarding: true, isNewUser: false });
  },

  clearError: () => set({ error: null }),
}));
