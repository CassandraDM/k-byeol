import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HolographicBackground } from '@/components/ui/holographic-background';
import { CustomFonts, Palette } from '@/constants/theme';

// TODO: build out the full onboarding flow (profile picture, username, preferences…)

export default function OnboardingScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <HolographicBackground />
      <View style={styles.content}>
        <Text style={styles.title}>Let's set up{'\n'}your profile!</Text>
        <Text style={styles.subtitle}>We'll keep this quick.</Text>

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.buttonText}>Get Started</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  title: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 32,
    color: Palette.pink,
    textAlign: 'center',
    lineHeight: 40,
  },
  subtitle: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 16,
    color: Palette.white,
    marginBottom: 24,
  },
  button: {
    backgroundColor: Palette.purple,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 40,
    shadowColor: Palette.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  buttonText: {
    fontFamily: CustomFonts.syongsyong,
    color: Palette.white,
    fontSize: 18,
  },
});
