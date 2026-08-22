import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { HolographicBackground } from '@/components/ui/holographic-background';
import { openPendingNotificationRoute } from '@/hooks/use-push-notifications';
import { useAuthStore } from '@/stores/auth-store';
import { markNavigationReady } from '@/utils/push-notifications';

export default function SplashScreen() {
  const router = useRouter();
  const { hydrate, isAuthenticated, emailVerified } = useAuthStore();

  useEffect(() => {
    const init = async () => {
      await hydrate();
    };
    init();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (isAuthenticated) {
        if (!emailVerified) {
          // Logged in but email not confirmed → prompt to verify (no email is
          // sent until the user taps "Send code" on that screen).
          router.replace('/(auth)/verify-prompt' as any);
        } else {
          router.replace('/(tabs)' as any);
          // If a notification tap launched the app, open it on top of the tabs
          // now that the initial route is settled.
          openPendingNotificationRoute();
        }
      } else {
        router.replace('/(auth)/sign-in' as any);
      }
      markNavigationReady();
    }, 2000);

    return () => clearTimeout(timeout);
  }, [isAuthenticated, emailVerified]);

  return (
    <View style={styles.container}>
      <HolographicBackground />
      <Image
        source={require('@/assets/images/logo.svg')}
        style={styles.logo}
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 180,
    height: 160,
  },
});
