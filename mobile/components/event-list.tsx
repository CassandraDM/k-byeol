import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CustomFonts, Palette } from '@/constants/theme';
import { EVENT_TYPE_CONFIG } from '@/constants/event-types';
import type { MapEvent } from '@/components/event-marker';

interface EventListProps {
  events: MapEvent[];
  /** Shown in the empty state so people know how to get results back. */
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function EventList({
  events,
  hasActiveFilters,
  onClearFilters,
}: EventListProps) {
  const router = useRouter();

  if (events.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons
          name="telescope-outline"
          size={44}
          color="rgba(207, 126, 242, 0.6)"
        />
        <Text style={styles.emptyTitle}>Nothing around here</Text>
        <Text style={styles.emptyText}>
          {hasActiveFilters
            ? 'No event matches your filters — try widening the distance or the dates.'
            : 'No event nearby yet. Why not be the one to start something?'}
        </Text>
        {hasActiveFilters && (
          <Pressable
            onPress={onClearFilters}
            style={({ pressed }) => [
              styles.clearButton,
              pressed && styles.pressed,
            ]}>
            <Ionicons name="refresh" size={15} color="#fff" />
            <Text style={styles.clearText}>Clear filters</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <FlatList
      data={events}
      keyExtractor={(e) => String(e.id)}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => {
        const config = EVENT_TYPE_CONFIG[item.type];
        return (
          <Pressable
            onPress={() => router.push(`/event/${item.id}` as any)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
            {item.imageUrl && (
              <Image
                source={{ uri: item.imageUrl }}
                style={styles.cover}
                resizeMode="cover"
              />
            )}

            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.title}
              </Text>

              <View style={styles.metaRow}>
                <View style={[styles.badge, { backgroundColor: config.color }]}>
                  <Text style={styles.badgeText}>{config.label}</Text>
                </View>
                <Text style={styles.distance}>{item.distance} km</Text>
              </View>

              <View style={styles.metaRow}>
                <Ionicons
                  name="calendar-outline"
                  size={12}
                  color={Palette.purple}
                />
                <Text style={styles.meta} numberOfLines={1}>
                  {formatDate(item.date)} · {item.time}
                </Text>
              </View>

              <View style={styles.metaRow}>
                <Ionicons
                  name="location-outline"
                  size={12}
                  color={Palette.purple}
                />
                <Text style={styles.meta} numberOfLines={1}>
                  {item.address}
                </Text>
              </View>
            </View>

            <Ionicons
              name="chevron-forward"
              size={18}
              color={Palette.purple}
              style={styles.chevron}
            />
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 100,
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#7B2FBE',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.2)',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  cover: {
    width: 76,
    alignSelf: 'stretch',
  },
  cardBody: {
    flex: 1,
    padding: 12,
    gap: 5,
  },
  cardTitle: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 17,
    color: '#1a1a2e',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 11,
    color: '#fff',
  },
  distance: {
    fontFamily: CustomFonts.outfitMedium,
    fontSize: 11,
    color: Palette.purple,
  },
  meta: {
    flex: 1,
    fontFamily: CustomFonts.outfit,
    fontSize: 12,
    color: '#555',
  },
  chevron: {
    marginRight: 10,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
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
    color: '#666',
    textAlign: 'center',
    lineHeight: 19,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 20,
    backgroundColor: Palette.purple,
  },
  clearText: {
    fontFamily: CustomFonts.outfitMedium,
    fontSize: 14,
    color: '#fff',
  },
});
