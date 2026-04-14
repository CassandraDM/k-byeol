import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CustomFonts, Palette } from '@/constants/theme';
import { EVENT_TYPE_CONFIG } from '@/constants/event-types';
import type { MapEvent } from '@/components/event-marker';

interface EventPreviewCardProps {
  event: MapEvent;
  onClose: () => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function EventPreviewCard({ event, onClose }: EventPreviewCardProps) {
  const router = useRouter();
  const config = EVENT_TYPE_CONFIG[event.type];

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => router.push(`/event/${event.id}` as any)}>
        <Pressable style={styles.closeButton} onPress={onClose} hitSlop={10}>
          <Ionicons name="close-circle" size={22} color={Palette.purple} />
        </Pressable>

        <Text style={styles.cardTitle} numberOfLines={1}>
          {event.title}
        </Text>

        <View style={styles.cardRow}>
          <View style={[styles.badge, { backgroundColor: config.color }]}>
            <Text style={styles.badgeText}>{config.label}</Text>
          </View>
        </View>

        <View style={styles.cardRow}>
          <Ionicons name="calendar-outline" size={12} color={Palette.purple} />
          <Text style={styles.cardMeta}>
            {formatDate(event.date)} · {event.time}
          </Text>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.cardCta}>View details</Text>
          <Ionicons name="chevron-forward" size={14} color={Palette.purple} />
        </View>
      </Pressable>

      <View style={styles.arrow} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: '30%',
    alignSelf: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    width: 220,
    gap: 6,
    shadowColor: '#7B2FBE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.25)',
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  closeButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 10,
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#fff',
  },
  cardTitle: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 16,
    color: '#1a1a2e',
    paddingRight: 24,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 11,
    color: '#fff',
  },
  cardMeta: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 12,
    color: '#555',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    marginTop: 2,
  },
  cardCta: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 13,
    color: Palette.purple,
  },
});
