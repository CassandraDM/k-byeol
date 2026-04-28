import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { useAuthStore } from '@/stores/auth-store';
import { getUserIdFromToken } from '@/utils/jwt';
import { ProfileContent } from '@/components/profile-content';

export default function AccountScreen() {
  const router = useRouter();
  const { hasCompletedOnboarding, token } = useAuthStore();
  const currentUserId = getUserIdFromToken(token);

  const handleCompleteProfile = () => {
    router.push('/(onboarding)' as any);
  };

  if (!currentUserId) return null;

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}>
      <ProfileContent
        userId={currentUserId}
        isOwnProfile
        showHeaderActions
        onboardingCompleted={hasCompletedOnboarding}
        onCompleteProfile={handleCompleteProfile}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 120,
  },
});
