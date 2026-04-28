import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CustomFonts, Palette } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth-store';
import { getUserIdFromToken } from '@/utils/jwt';
import { ProfileContent } from '@/components/profile-content';

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuthStore();
  const currentUserId = getUserIdFromToken(token);
  const profileId = Number(id);
  const isOwnProfile = currentUserId === profileId;

  return (
    <LinearGradient colors={['#EDE7FF', '#F2EDFF']} style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.iconSlot}
            hitSlop={8}>
            <Ionicons name="chevron-back" size={28} color={Palette.purple} />
          </Pressable>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={styles.iconSlot} />
        </View>

        <ProfileContent
          userId={profileId}
          isOwnProfile={isOwnProfile}
        />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    paddingBottom: 120,
    paddingHorizontal: 20,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconSlot: {
    width: 32,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: CustomFonts.moyamoya,
    fontSize: 32,
    color: Palette.purple,
    lineHeight: 42,
    paddingTop: 4,
  },
});
