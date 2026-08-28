import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CustomFonts, Palette } from '@/constants/theme';
import { apiFetch } from '@/utils/api';

interface Participant {
  id: number;
  username: string;
  avatar: string | null;
  isOrganizer: boolean;
}

interface EventParticipantsProps {
  eventId: number;
  /** Re-fetches when this changes, e.g. after joining or leaving. */
  refreshKey?: number;
}

/**
 * Who is going. The API already drops anyone the viewer has blocked, in
 * either direction, so this renders whatever it is given.
 */
export function EventParticipants({
  eventId,
  refreshKey = 0,
}: EventParticipantsProps) {
  const router = useRouter();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await apiFetch(`/events/${eventId}/participants`);
        if (res.ok && !cancelled) {
          setParticipants((await res.json()) as Participant[]);
        }
      } catch (e) {
        console.error('[EventParticipants] Load error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [eventId, refreshKey]);

  if (loading || participants.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      {participants.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => router.push(`/profile/${p.id}` as any)}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
          {p.avatar ? (
            <Image source={{ uri: p.avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Ionicons name="person" size={13} color="#fff" />
            </View>
          )}
          <Text style={styles.name} numberOfLines={1}>
            {p.username}
          </Text>
          {p.isOrganizer && (
            <Ionicons name="star" size={11} color="#E0A800" />
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
    paddingRight: 10,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.25)',
    maxWidth: 170,
  },
  pressed: {
    opacity: 0.8,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  avatarFallback: {
    backgroundColor: Palette.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    flexShrink: 1,
    fontFamily: CustomFonts.moyamoya,
    fontSize: 13,
    color: Palette.purple,
  },
});
