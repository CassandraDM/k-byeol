import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const [fontsLoaded, fontError] = useFonts({
    Syongsyong: require('@/assets/fonts/Cafe24Syongsyong-v2.0/Cafe24Syongsyong-v2.0.ttf'),
    Moyamoya: require('@/assets/fonts/Cafe24Moyamoya-v1.0/Cafe24Moyamoya-Regular-v1.0.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        {/* Splash */}
        <Stack.Screen name="index" options={{ headerShown: false, animation: 'none' }} />
        {/* Auth flow — sign-in / sign-up (no tab bar) */}
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        {/* Onboarding — new users only */}
        <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
        {/* Main app */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* Event detail */}
        <Stack.Screen name="event/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
