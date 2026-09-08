import * as FileSystem from 'expo-file-system/legacy';

import { API_URL } from '@/constants/api';
import { useAuthStore } from '@/stores/auth-store';
import { apiFetch } from '@/utils/api';
import type { SocialProvider } from '@/utils/social-auth';

/**
 * What the account can offer as proof before something irreversible.
 *
 * A Google or Apple account holds a random password minted at signup that its
 * owner has never seen, so asking them to re-type it would be asking for
 * something that does not exist. They go back through the provider instead.
 */
export function confirmationMethod(
  provider: string | null | undefined,
): 'password' | 'provider' {
  return provider === 'google' || provider === 'apple' ? 'provider' : 'password';
}

/** The provider's name as it should appear on a button. */
export function providerLabel(provider: string | null | undefined): string {
  if (provider === 'google') return 'Google';
  if (provider === 'apple') return 'Apple';
  return 'your provider';
}

/** Dated so a second export does not silently overwrite the first. */
export function exportFileName(now: Date = new Date()): string {
  return `k-byeol-export-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Turns a failed deletion into something worth reading.
 *
 * 401 is the one that matters: it is the wrong password, and saying so is what
 * lets the user fix it. Everything else is ours to apologise for.
 */
export function deleteAccountError(
  status: number,
  body: { message?: string | string[] } | null,
): string {
  if (status === 401) {
    return "That password doesn't match. Try again.";
  }
  if (status === 400) {
    const message = Array.isArray(body?.message)
      ? body?.message[0]
      : body?.message;
    return message ?? 'Something was missing from that request.';
  }
  if (status === 429) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  return 'Hmm… something’s off. Try again.';
}

export type DeleteResult =
  | { status: 'deleted' }
  | { status: 'error'; message: string };

/**
 * Asks the API to delete this account, with whichever proof it accepts.
 *
 * The caller signs out afterwards: the token keeps working right up to the
 * moment the account is gone, and every request after that is a 401.
 */
export async function deleteMyAccount(
  confirmation: { password: string } | { accessToken: string },
): Promise<DeleteResult> {
  try {
    // Deliberately not apiFetch: it reads a 401 as an expired session and
    // signs the user out. Here a 401 means the password was wrong, and being
    // thrown back to the sign-in screen for a typo would be absurd.
    const { token } = useAuthStore.getState();
    const res = await fetch(`${API_URL}/me`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(confirmation),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        message?: string | string[];
      } | null;
      return { status: 'error', message: deleteAccountError(res.status, body) };
    }

    return { status: 'deleted' };
  } catch (e) {
    console.error('[deleteMyAccount] network error →', e);
    return {
      status: 'error',
      message: "Can't reach the server right now. Check your connection.",
    };
  }
}

export type ExportResult =
  | { status: 'shared' }
  | { status: 'error'; message: string };

/**
 * Loads expo-sharing at the point of use rather than at the top of the file.
 *
 * It is a native module: a static import runs `requireNativeModule` the moment
 * anything imports this file, and a client built before the dependency existed
 * does not have it — which took every screen importing this one down with it,
 * not just the export. Loaded here, a missing module is one button reporting
 * that it needs a rebuild, which is the truth and is survivable.
 */
async function loadSharing(): Promise<typeof import('expo-sharing') | null> {
  try {
    return await import('expo-sharing');
  } catch {
    return null;
  }
}

/**
 * Downloads the account's data and hands the file to the OS share sheet.
 *
 * It goes to the cache directory rather than documents: once the user has sent
 * it wherever they wanted, a copy of everything they have ever posted is not
 * something the app should keep sitting on the device.
 */
export async function exportMyData(): Promise<ExportResult> {
  try {
    const res = await apiFetch('/me/export');
    if (!res.ok) {
      return {
        status: 'error',
        message: 'Couldn’t put your data together. Try again.',
      };
    }

    const json = await res.text();
    const uri = `${FileSystem.cacheDirectory}${exportFileName()}`;
    await FileSystem.writeAsStringAsync(uri, json, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const Sharing = await loadSharing();
    if (!Sharing) {
      return {
        status: 'error',
        message:
          'This build can’t open the share sheet yet. Rebuild the app to export your data.',
      };
    }
    if (!(await Sharing.isAvailableAsync())) {
      return {
        status: 'error',
        message: 'Sharing isn’t available on this device.',
      };
    }

    await Sharing.shareAsync(uri, {
      mimeType: 'application/json',
      dialogTitle: 'Your K-별 data',
      UTI: 'public.json',
    });

    return { status: 'shared' };
  } catch (e) {
    console.error('[exportMyData] error →', e);
    return {
      status: 'error',
      message: "Can't reach the server right now. Check your connection.",
    };
  }
}

/** Re-exported so screens need only one import to drive the delete flow. */
export type { SocialProvider };
