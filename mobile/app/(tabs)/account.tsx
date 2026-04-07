import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CustomFonts } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth-store';

export default function AccountScreen() {
  const router = useRouter();
  const { signOut } = useAuthStore();

  const handleLogout = async () => {
    await signOut();
    router.replace('/(auth)/sign-in' as any);
  };

  return (
    <View style={styles.container}>
      <ThemedText type="title">Account</ThemedText>

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
