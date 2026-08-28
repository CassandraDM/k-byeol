import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CustomFonts, PageBackground, Palette } from '@/constants/theme';
import { apiFetch } from '@/utils/api';
import { unblockUser } from '@/utils/moderation';

interface BlockedUser {
  id: number;
  username: string;
  avatar: string | null;
  blockedAt: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function BlockedUsersScreen() {
  const router = useRouter();
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<number | null>(null);
  // Starts at the server's default, so the switch never flashes the wrong way.
  const [hideEvents, setHideEvents] = useState(true);

  const load = useCallback(async () => {
    try {
      const [blocksRes, prefsRes] = await Promise.all([
        apiFetch('/users/me/blocks'),
        apiFetch('/users/me/preferences'),
      ]);
      if (blocksRes.ok) setBlocked((await blocksRes.json()) as BlockedUser[]);
      if (prefsRes.ok) {
        const prefs = await prefsRes.json();
        if (prefs?.hideBlockedEvents !== undefined) {
          setHideEvents(prefs.hideBlockedEvents);
        }
      }
    } catch (e) {
      console.error('[Blocked] Load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleHideEvents = async (next: boolean) => {
    // Optimistic: the switch should never lag behind the finger.
    setHideEvents(next);
    try {
      const res = await apiFetch('/users/me/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hideBlockedEvents: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch (e) {
      console.error('[Blocked] Preference save failed:', e);
      setHideEvents(!next);
      Alert.alert('Not saved', 'Could not change that setting. Try again.');
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const confirmUnblock = (user: BlockedUser) => {
    Alert.alert(
      `Unblock ${user.username}?`,
      `${user.username} will be able to see your profile and message you again, and you will see them.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            setPendingId(user.id);
            const ok = await unblockUser(user.id);
            setPendingId(null);
            if (ok) {
              setBlocked((prev) => prev.filter((b) => b.id !== user.id));
            } else {
              Alert.alert(
                'Something went wrong',
                'Could not unblock. Try again.',
              );
            }
          },
        },
      ],
    );
  };

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
          <Text style={styles.headerTitle}>Blocked</Text>
          <View style={styles.iconSlot} />
        </View>

        {!loading && (
          <View style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingBody}>
                <Text style={styles.settingLabel}>Hide their events</Text>
                <Text style={styles.settingHint}>
                  Keep events from people you block off the map and out of
                  search.
                </Text>
              </View>
              <Switch
                value={hideEvents}
                onValueChange={toggleHideEvents}
                trackColor={{
                  false: 'rgba(207, 126, 242, 0.25)',
                  true: Palette.purple,
                }}
                thumbColor="#fff"
              />
            </View>
          </View>
        )}

        {loading ? (
          <ActivityIndicator
            size="large"
            color={Palette.purple}
            style={styles.loader}
          />
        ) : blocked.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons
              name="shield-checkmark-outline"
              size={44}
              color="rgba(207, 126, 242, 0.6)"
            />
            <Text style={styles.emptyTitle}>Nobody blocked</Text>
            <Text style={styles.emptyText}>
              People you block stop seeing you, and you stop seeing them. They
              will show up here.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.hint}>
              Blocking works both ways. Unblocking lets you see each other
              again.
            </Text>

            <View style={styles.card}>
              {blocked.map((user, index) => (
                <View
                  key={user.id}
                  style={[styles.row, index > 0 && styles.rowDivider]}>
                  {user.avatar ? (
                    <Image
                      source={{ uri: user.avatar }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Ionicons name="person" size={18} color="#fff" />
                    </View>
                  )}

                  <View style={styles.rowBody}>
                    <Text style={styles.username} numberOfLines={1}>
                      {user.username}
                    </Text>
                    <Text style={styles.since}>
                      Blocked {formatDate(user.blockedAt)}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => confirmUnblock(user)}
                    disabled={pendingId === user.id}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.unblock,
                      pressed && styles.pressed,
                    ]}>
                    {pendingId === user.id ? (
                      <ActivityIndicator size="small" color={Palette.purple} />
                    ) : (
                      <Text style={styles.unblockText}>Unblock</Text>
                    )}
                  </Pressable>
                </View>
              ))}
            </View>
          </>
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
  loader: {
    marginTop: 60,
  },
  hint: {
    fontFamily: CustomFonts.outfit,
    fontSize: 13,
    color: Palette.purple,
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 12,
  },
  settingCard: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.2)',
    marginTop: 8,
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  settingBody: {
    flex: 1,
    gap: 2,
  },
  settingLabel: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 15,
    color: Palette.purple,
  },
  settingHint: {
    fontFamily: CustomFonts.outfit,
    fontSize: 11,
    color: 'rgba(207, 126, 242, 0.75)',
    lineHeight: 15,
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
  username: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 15,
    color: Palette.purple,
  },
  since: {
    fontFamily: CustomFonts.outfit,
    fontSize: 11,
    color: 'rgba(207, 126, 242, 0.7)',
  },
  unblock: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.45)',
    minWidth: 84,
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
  unblockText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 15,
    color: Palette.purple,
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
});
