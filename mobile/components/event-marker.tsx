import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Callout, Marker } from 'react-native-maps';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { EVENT_TYPE_CONFIG } from '@/constants/event-types';
import { CustomFonts, Palette } from '@/constants/theme';
import type { EventType } from '@/constants/event-types';

export interface MapEvent {
  id: number;
  title: string;
  type: EventType;
  latitude: number;
  longitude: number;
  address: string;
  date: string;
  time: string;
  description: string;
  imageUrl: string | null;
  organizerId: number;
  distance: number;
  isParticipating: boolean;
}

interface EventMarkerProps {
  event: MapEvent;
  isSelected: boolean;
  onSelect: (event: MapEvent) => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function EventMarker({ event, isSelected, onSelect }: EventMarkerProps) {
  const config = EVENT_TYPE_CONFIG[event.type];
  const router = useRouter();
  const markerRef = useRef<any>(null);

  // When this marker becomes selected (after zoom), open the callout
  useEffect(() => {
    if (isSelected) {
      // Small delay to let the Callout mount first
      const timer = setTimeout(() => {
        markerRef.current?.showCallout();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isSelected]);

  return (
    <Marker
      ref={markerRef}
      coordinate={{ latitude: event.latitude, longitude: event.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      calloutAnchor={{ x: 0.5, y: 0 }}
      onPress={() => onSelect(event)}
      tracksViewChanges={false}>
      <Ionicons
        name="star"
        size={38}
        color={event.isParticipating ? Palette.purple : config.color}
        style={styles.marker}
      />

      {/* Callout only exists when selected — no flash on tap */}
      {isSelected && (
        <Callout
          tooltip
          style={styles.calloutContainer}
          onPress={() => router.push(`/event/${event.id}` as any)}>
          <View style={styles.card}>
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
          </View>
          <View style={styles.calloutArrow} />
        </Callout>
      )}
    </Marker>
  );
}

const styles = StyleSheet.create({
  marker: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 5,
  },
  calloutContainer: {
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    width: 210,
    gap: 6,
    shadowColor: '#7B2FBE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.25)',
  },
  calloutArrow: {
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
