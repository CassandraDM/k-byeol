import { router } from 'expo-router';

import { API_URL } from '@/constants/api';
import { useAuthStore } from '@/stores/auth-store';

let redirecting = false;

/**
 * Authenticated fetch wrapper.
 *
 * - Prefixes relative paths with API_URL.
 * - Attaches `Authorization: Bearer <token>` automatically when a token exists.
 * - On 401, signs the user out and redirects to the sign-in screen.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const { token } = useAuthStore.getState();

  const headers = new Headers(options.headers ?? {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    // Avoid multiple concurrent signOut/redirect calls
    if (!redirecting) {
      redirecting = true;
      try {
        await useAuthStore.getState().signOut();
      } catch {
        /* ignore */
      }
      router.replace('/(auth)/sign-in' as any);
      // Release after the nav tick
      setTimeout(() => {
        redirecting = false;
      }, 500);
    }
  }

  return res;
}
