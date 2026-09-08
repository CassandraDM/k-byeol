import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Resolves the backend base URL automatically:
 *
 * - Physical device  → extracts the host IP from Expo's dev server URI
 *                      (the same IP the phone already uses to load the app bundle)
 * - Android emulator → 10.0.2.2  (maps to host machine)
 * - iOS simulator    → localhost
 * - Production       → the API deployed on Railway
 */
function getDevUrl(): string {
  // Expo stores the dev server address (e.g. "192.168.1.42:8081") in hostUri.
  // We strip the port and replace it with 3000 (our NestJS backend port).
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.manifest as any)?.debuggerHost;

  if (hostUri) {
    const host = hostUri.split(':')[0]; // "192.168.1.42"
    return `http://${host}:3000`;
  }

  // Fallback for bare emulators with no hostUri
  return Platform.OS === 'android'
    ? 'http://10.0.2.2:3000'
    : 'http://localhost:3000';
}

/**
 * Base URL for both the REST calls and the socket.io connection — the gateway
 * shares the API's HTTP server, so it lives on the same origin.
 *
 * The production value is baked in at build time, not read at runtime: an EAS
 * build made before this line was set would ship an app that reaches nothing.
 */
export const API_URL = __DEV__
  ? getDevUrl()
  : 'https://k-byeol-production.up.railway.app';
