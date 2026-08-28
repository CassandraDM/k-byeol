import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CustomFonts, PageBackground, Palette } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth-store';
import { getUserIdFromToken } from '@/utils/jwt';
import {
  fetchFollowers,
  fetchUserFollowing,
  type Connection,
} from '@/utils/follows';

type Tab = 'following' | 'followers';

/**
 * The people around a profile — who they follow, and who follows them.
 *
 * Both sides are readable for any profile the viewer can see; a block hides
 * the profile itself, and anyone the viewer has blocked drops out of the list.
 */
export default function ConnectionsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    userId: string;
    tab?: Tab;
    username?: string;
  }>();
  const { token } = useAuthStore();

  const profileId = Number(params.userId);
  const isOwnProfile = getUserIdFromToken(token) === profileId;
  const [tab, setTab] = useState<Tab>(
    params.tab === 'following' ? 'following' : 'followers',
  );

  const [people, setPeople] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result =
      tab === 'following'
        ? await fetchUserFollowing(profileId)
        : await fetchFollowers(profileId);

    // A read error is surfaced rather than shown as an empty list — an empty
    // screen would read as "nobody follows you", which may not be true.
    setFailed(result === null);
    if (result === null) {
      setPeople([]);
    } else {
      setPeople('followers' in result ? result.followers : result.following);
    }
    setLoading(false);
  }, [tab, profileId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const title = tab === 'following' ? 'Following' : 'Followers';
  const emptyText =
    tab === 'following'
      ? isOwnProfile
        ? 'Follow organisers and crews to hear about their events first.'
        : "They aren't following anyone yet."
      : isOwnProfile
        ? 'Nobody follows you yet. Post an event and they will come.'
        : 'Nobody follows them yet.';

  return (
    <LinearGradient colors={PageBackground} style={styles.flex}>
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
          <Text style={styles.headerTitle}>
            {isOwnProfile ? title : (params.username ?? title)}
          </Text>
          <View style={styles.iconSlot} />
        </View>

        <View style={styles.tabs}>
          {(['following', 'followers'] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setTab(value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === value }}
              style={[styles.tab, tab === value && styles.tabActive]}>
              <Text
                style={[styles.tabText, tab === value && styles.tabTextActive]}>
                {value === 'following' ? 'Following' : 'Followers'}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator
            size="large"
            color={Palette.purple}
            style={styles.loader}
          />
        ) : failed ? (
          <View style={styles.empty}>
            <Ionicons
              name="cloud-offline-outline"
              size={44}
              color="rgba(207, 126, 242, 0.6)"
            />
            <Text style={styles.emptyTitle}>Could not load</Text>
            <Text style={styles.emptyText}>
              Check your connection and try again.
            </Text>
            <Pressable
              onPress={load}
              style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : people.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons
              name="people-outline"
              size={44}
              color="rgba(207, 126, 242, 0.6)"
            />
            <Text style={styles.emptyTitle}>Nobody here yet</Text>
            <Text style={styles.emptyText}>{emptyText}</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {people.map((person, index) => (
              <Pressable
                key={person.id}
                onPress={() => router.push(`/profile/${person.id}` as any)}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && styles.rowDivider,
                  pressed && styles.pressed,
                ]}>
                {person.avatar ? (
                  <Image
                    source={{ uri: person.avatar }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Ionicons name="person" size={18} color="#fff" />
                  </View>
                )}

                <View style={styles.rowBody}>
                  <View style={styles.nameRow}>
                    <Text style={styles.username} numberOfLines={1}>
                      {person.username}
                    </Text>
                    {/* Following each other is what makes two people friends. */}
                    {person.isFriend && (
                      <View style={styles.friendChip}>
                        <Ionicons name="people" size={11} color={Palette.purple} />
                        <Text style={styles.friendChipText}>Friends</Text>
                      </View>
                    )}
                  </View>
                  {person.bio ? (
                    <Text style={styles.bio} numberOfLines={1}>
                      {person.bio}
                    </Text>
                  ) : null}
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={Palette.purple}
                />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 60,
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
    fontSize: 28,
    color: Palette.purple,
    lineHeight: 38,
    paddingTop: 4,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.25)',
  },
  tabActive: {
    backgroundColor: 'rgba(207, 126, 242, 0.18)',
    borderColor: Palette.purple,
  },
  tabText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 15,
    color: 'rgba(207, 126, 242, 0.7)',
  },
  tabTextActive: {
    color: Palette.purple,
  },
  loader: {
    marginTop: 60,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.2)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(207, 126, 242, 0.15)',
  },
  pressed: {
    opacity: 0.8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    backgroundColor: Palette.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  username: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 15,
    color: Palette.purple,
    flexShrink: 1,
  },
  friendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(207, 126, 242, 0.15)',
  },
  friendChipText: {
    fontFamily: CustomFonts.outfitMedium,
    fontSize: 10,
    color: Palette.purple,
  },
  bio: {
    fontFamily: CustomFonts.outfit,
    fontSize: 11,
    color: 'rgba(207, 126, 242, 0.75)',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingTop: 80,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 22,
    color: Palette.purple,
    lineHeight: 30,
    paddingTop: 6,
  },
  emptyText: {
    fontFamily: CustomFonts.outfit,
    fontSize: 13,
    color: Palette.purple,
    textAlign: 'center',
    lineHeight: 19,
  },
  retry: {
    marginTop: 6,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.45)',
  },
  retryText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 15,
    color: Palette.purple,
  },
});
