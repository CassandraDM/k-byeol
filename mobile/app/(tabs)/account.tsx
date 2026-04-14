import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { CustomFonts, Palette } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth-store';
import { useOnboardingStore } from '@/stores/onboarding-store';

export default function AccountScreen() {
  const router = useRouter();
  const { signOut, hasCompletedOnboarding } = useAuthStore();

  const handleLogout = async () => {
    await signOut();
    router.replace('/(auth)/sign-in' as any);
  };

  const handleCompleteProfile = () => {
    router.push('/(onboarding)' as any);
  };

  return (
    <View style={styles.container}>
      <ThemedText type="title">Account</ThemedText>

      {!hasCompletedOnboarding && (
        <Pressable
          style={({ pressed }) => [styles.noticeCard, pressed && styles.buttonPressed]}
          onPress={handleCompleteProfile}>
          <View style={styles.noticeContent}>
            <Ionicons name="alert-circle-outline" size={22} color={Palette.purple} />
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.noticeTitle}>Complete your profile</ThemedText>
              <ThemedText style={styles.noticeSubtitle}>
                Add your picture, city & favorite groups
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Palette.purple} />
          </View>
        </Pressable>
      )}

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={handleLogout}>
        <ThemedText style={styles.buttonText}>Log Out</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    gap: 32,
    paddingHorizontal: 24,
  },
  noticeCard: {
    width: '100%',
    backgroundColor: 'rgba(207, 126, 242, 0.1)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Palette.purple,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  noticeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  noticeTitle: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 16,
    color: Palette.purple,
  },
  noticeSubtitle: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 12,
    color: Palette.pink,
    marginTop: 2,
  },
  button: {
    backgroundColor: '#7B2FBE',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 36,
    shadowColor: '#7B2FBE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  buttonText: {
    fontFamily: CustomFonts.syongsyong,
    color: '#fff',
    fontSize: 16,
    letterSpacing: 0.3,
  },
});
