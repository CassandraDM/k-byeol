import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { getSupabase } from '@/constants/supabase';

export type SocialProvider = 'google' | 'apple';

/**
 * Three outcomes, kept apart on purpose: a user who backs out of the provider's
 * sheet has not hit an error, and showing them one would be a lie.
 */
export type SocialTokenResult =
  | { status: 'ok'; accessToken: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/**
 * Runs the provider's sign-in and hands back the resulting Supabase access
 * token, without touching the app's own session.
 *
 * Two callers need exactly this and nothing more: signing in, and confirming
 * something irreversible — deleting the account — for a user whose only
 * password is a random string minted at signup that they have never seen. The
 * flow is fiddly enough (native sheet on iOS, web OAuth everywhere else, a code
 * exchange at the end) that having it written twice would mean fixing it twice.
 */
export async function requestSupabaseAccessToken(
  provider: SocialProvider,
): Promise<SocialTokenResult> {
  try {
    const supabase = getSupabase();

    if (provider === 'apple' && Platform.OS === 'ios') {
      // ── Native Apple sign-in (iOS) ────────────────────────────────────────
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        return { status: 'cancelled' };
      }
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error || !data.session) {
        return { status: 'error', message: 'Sign-in failed. Try again.' };
      }
      return { status: 'ok', accessToken: data.session.access_token };
    }

    // ── Web OAuth flow (Google, and Apple on Android) ──────────────────────
    const redirectTo = Linking.createURL('auth-callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) {
      return { status: 'error', message: "Couldn't start sign-in. Try again." };
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') {
      return { status: 'cancelled' };
    }

    const parsed = Linking.parse(result.url);
    const code = parsed.queryParams?.code as string | undefined;
    if (!code) {
      return { status: 'error', message: 'Sign-in was interrupted. Try again.' };
    }

    const { data: sessionData, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    const accessToken = sessionData?.session?.access_token;
    if (exchangeError || !accessToken) {
      return { status: 'error', message: 'Sign-in failed. Try again.' };
    }

    return { status: 'ok', accessToken };
  } catch (e) {
    // Tapping "Cancel" on the native Apple sheet throws rather than returning.
    if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') {
      return { status: 'cancelled' };
    }
    console.error('[requestSupabaseAccessToken] error →', e);
    return {
      status: 'error',
      message: "Can't reach the server right now. Check your connection.",
    };
  }
}

/**
 * Drops the Supabase session locally once its token has served its purpose.
 *
 * Storage uploads (avatars, event covers) should go out under the anon key
 * rather than this user's OAuth token. "local" scope so the token is not
 * revoked server-side, which would be somebody else's decision to make.
 */
export async function releaseSupabaseSession() {
  await getSupabase()
    .auth.signOut({ scope: 'local' })
    .catch(() => {});
}
