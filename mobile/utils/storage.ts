import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Cross-platform key/value storage.
 *
 * - Native (iOS/Android): expo-secure-store (Keychain / Keystore).
 * - Web: localStorage — expo-secure-store has no web implementation, so the
 *   native calls throw ("setValueWithKeyAsync is not a function") in a browser.
 */
const isWeb = Platform.OS === "web";

export async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    (globalThis as any).localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    return (globalThis as any).localStorage?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

export async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    (globalThis as any).localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
