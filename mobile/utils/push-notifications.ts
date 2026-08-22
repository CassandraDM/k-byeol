import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { API_URL } from "@/constants/api";
import { deleteItem, getItem, setItem } from "@/utils/storage";

/** Where the last registered Expo token is kept, so sign-out can revoke it. */
const PUSH_TOKEN_KEY = "kbyeol_push_token";

/** Must match the `channelId` the backend sends with every push. */
const ANDROID_CHANNEL_ID = "default";

/**
 * Payload the backend attaches to every push (see `PushData` in
 * `notifications.service.ts`). It tells us which screen to open on tap.
 */
export type PushData =
  | { type: "chat"; conversationId: number }
  | { type: "event"; eventId: number };

/**
 * Show notifications even while the app is in the foreground — a chat message
 * arriving on another screen should still surface.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Turns a notification payload into the route it should open. */
export function routeForNotification(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as Partial<PushData> & Record<string, unknown>;

  if (payload.type === "chat" && payload.conversationId != null) {
    return `/chat/${payload.conversationId}`;
  }
  if (payload.type === "event" && payload.eventId != null) {
    return `/event/${payload.eventId}`;
  }
  return null;
}

/**
 * Asks for notification permission, fetches this device's Expo push token and
 * stores it against the signed-in user.
 *
 * Best-effort: returns `null` (and never throws) when notifications aren't
 * available — web, a simulator without push support, or a declined prompt.
 */
export async function registerPushToken(
  authToken: string,
): Promise<string | null> {
  if (Platform.OS === "web") return null;

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: "Default",
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: "#7A3FB0",
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId;
    if (!projectId) {
      console.warn("[push] No EAS projectId — can't request a push token.");
      return null;
    }

    const { data: pushToken } = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const res = await fetch(`${API_URL}/notifications/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token: pushToken, platform: Platform.OS }),
    });
    if (!res.ok) {
      console.error("[push] Failed to store token →", res.status);
      return null;
    }

    await setItem(PUSH_TOKEN_KEY, pushToken);
    return pushToken;
  } catch (e) {
    console.error("[push] Registration failed →", e);
    return null;
  }
}

/**
 * Detaches this device from the account being signed out, so the next person
 * to use the phone doesn't receive their notifications.
 */
export async function unregisterPushToken(
  authToken: string | null,
): Promise<void> {
  try {
    const pushToken = await getItem(PUSH_TOKEN_KEY);
    if (!pushToken) return;

    if (authToken) {
      await fetch(`${API_URL}/notifications/token`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token: pushToken }),
      });
    }
    await deleteItem(PUSH_TOKEN_KEY);
  } catch (e) {
    console.error("[push] Failed to revoke token →", e);
  }
}

// ── Cold-start deep links ───────────────────────────────────────────────────
// Tapping a notification while the app is closed fires the response listener
// before the splash screen has decided where to send the user — and its
// `router.replace` would wipe out any navigation we did first. So we park the
// route here and let the splash open it once it has landed on the tabs.

let pendingRoute: string | null = null;
let navigationReady = false;

/** True once the splash has routed and it's safe to navigate on tap. */
export function isNavigationReady(): boolean {
  return navigationReady;
}

/** Called by the splash screen once it has picked the initial route. */
export function markNavigationReady(): void {
  navigationReady = true;
}

export function setPendingNotificationRoute(route: string): void {
  pendingRoute = route;
}

/** Returns the parked route (if any) and clears it. */
export function consumePendingNotificationRoute(): string | null {
  const route = pendingRoute;
  pendingRoute = null;
  return route;
}
