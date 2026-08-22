import { useEffect } from "react";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";

import {
  consumePendingNotificationRoute,
  isNavigationReady,
  routeForNotification,
  setPendingNotificationRoute,
} from "@/utils/push-notifications";

/**
 * Opens the right screen when a notification is tapped — the chat thread for a
 * new message, the event detail for a participation or a start reminder.
 *
 * Handles both cases: the app was already running (navigate straight away) and
 * the app was launched by the tap (park the route for the splash to pick up).
 */
export function usePushNotifications() {
  useEffect(() => {
    let cancelled = false;

    const open = (data: unknown) => {
      const route = routeForNotification(data);
      if (!route) return;
      if (isNavigationReady()) {
        router.push(route as never);
      } else {
        setPendingNotificationRoute(route);
      }
    };

    // Cold start: the tap that launched the app.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (cancelled || !response) return;
        open(response.notification.request.content.data);
      })
      .catch(() => {
        // No launch notification — nothing to route to.
      });

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => open(response.notification.request.content.data),
    );

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);
}

/**
 * Navigates to a notification route that arrived before the app had finished
 * booting. Call once the initial screen is in place.
 */
export function openPendingNotificationRoute(): void {
  const route = consumePendingNotificationRoute();
  if (!route) return;
  // Let the initial `replace` settle before stacking the target screen on top.
  setTimeout(() => router.push(route as never), 0);
}
