import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { HolographicBackground } from '@/components/ui/holographic-background';
import { useAuthStore } from '@/stores/auth-store';

export default function SplashScreen() {
  const router = useRouter();
  const { hydrate, isAuthenticated } = useAuthStore();

  useEffect(() => {
    const init = async () => {
      await hydrate();
    };
    init();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (isAuthenticated) {
        router.replace('/(tabs)' as any);
      } else {
        router.replace('/(auth)/sign-in' as any);
      }
    }, 2000);

    return () => clearTimeout(timeout);
  }, [isAuthenticated]);

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
