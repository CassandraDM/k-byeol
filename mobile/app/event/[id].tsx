import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker } from 'react-native-maps';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ThemedText } from '@/components/themed-text';
import { CustomFonts, Palette } from '@/constants/theme';
import { EVENT_TYPE_CONFIG } from '@/constants/event-types';
import { useAuthStore } from '@/stores/auth-store';
import { API_URL } from '@/constants/api';
import type { EventType } from '@/constants/event-types';

interface EventDetail {
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
  organizer: { id: number; username: string; avatar: string | null };
  participantCount: number;
  isParticipating: boolean;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuthStore();
  const router = useRouter();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isParticipating, setIsParticipating] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!token || !id) return;

    async function fetchEvent() {
      try {
        const res = await fetch(`${API_URL}/events/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setEvent(data);
          setParticipantCount(data.participantCount);
          setIsParticipating(data.isParticipating);
        }
      } catch (e) {
        console.error('[EventDetail] Failed to fetch:', e);
      } finally {
        setIsLoading(false);
      }
    }

    fetchEvent();
  }, [token, id]);

  const handleParticipate = async () => {
    if (!token || !id || actionLoading) return;
    setActionLoading(true);

    try {
      const method = isParticipating ? 'DELETE' : 'POST';
      const res = await fetch(`${API_URL}/events/${id}/participate`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setIsParticipating(!isParticipating);
        setParticipantCount((c) => c + (isParticipating ? -1 : 1));
      }
    } catch (e) {
      console.error('[EventDetail] Participation error:', e);
    } finally {
      setActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <LinearGradient colors={['#EDE7FF', '#F2EDFF']} style={styles.loader}>
        <ActivityIndicator size="large" color="#B100FF" />
      </LinearGradient>
    );
  }

  if (!event) {
    return (
      <LinearGradient colors={['#EDE7FF', '#F2EDFF']} style={styles.loader}>
        <ThemedText style={styles.errorText}>Event not found</ThemedText>
      </LinearGradient>
    );
  }

  const config = EVENT_TYPE_CONFIG[event.type];

  return (
    <LinearGradient colors={['#EDE7FF', '#F2EDFF']} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Palette.purple} />
          </Pressable>
          <ThemedText style={styles.title}>{event.title}</ThemedText>
          <View style={[styles.badge, { backgroundColor: config.color }]}>
            <Ionicons name={config.icon} size={14} color="#fff" />
            <ThemedText style={styles.badgeText}>{config.label}</ThemedText>
          </View>
        </View>

        {/* Info rows */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={18} color={Palette.purple} />
            <ThemedText style={styles.infoText}>
              {formatDate(event.date)} at {event.time}
            </ThemedText>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={18} color={Palette.purple} />
            <ThemedText style={styles.infoText}>{event.address}</ThemedText>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={18} color={Palette.purple} />
            <ThemedText style={styles.infoText}>
              Organized by {event.organizer.username}
            </ThemedText>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="people-outline" size={18} color={Palette.purple} />
            <ThemedText style={styles.infoText}>
              {participantCount} participant{participantCount !== 1 ? 's' : ''}
            </ThemedText>
          </View>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>About</ThemedText>
          <ThemedText style={styles.description}>{event.description}</ThemedText>
        </View>

        {/* Mini map */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Location</ThemedText>
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              initialRegion={{
                latitude: event.latitude,
                longitude: event.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}>
              <Marker
                coordinate={{
                  latitude: event.latitude,
                  longitude: event.longitude,
                }}
              />
            </MapView>
          </View>
        </View>
      </ScrollView>

      {/* Bottom action */}
      <View style={styles.bottomBar}>
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            isParticipating && styles.actionButtonLeave,
            pressed && styles.actionButtonPressed,
          ]}
          onPress={handleParticipate}
          disabled={actionLoading}>
          {actionLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons
                name={isParticipating ? 'exit-outline' : 'hand-left-outline'}
                size={20}
                color="#fff"
              />
              <ThemedText style={styles.actionButtonText}>
                {isParticipating ? 'Leave Event' : 'Join Event'}
              </ThemedText>
            </>
          )}
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 18,
    color: Palette.purple,
  },
  scrollContent: {
    paddingTop: 60,
    paddingBottom: 100,
    paddingHorizontal: 20,
  },
  header: {
    gap: 10,
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 28,
    color: '#1a1a2e',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  badgeText: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 13,
    color: '#fff',
  },
  infoCard: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoText: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 20,
    color: '#1a1a2e',
    marginBottom: 8,
  },
  description: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 14,
    color: '#444',
    lineHeight: 22,
  },
  mapContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    height: 180,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 34,
    paddingTop: 12,
    backgroundColor: 'rgba(237, 231, 255, 0.9)',
  },
  actionButton: {
    backgroundColor: '#7B2FBE',
    borderRadius: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#7B2FBE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  actionButtonLeave: {
    backgroundColor: '#E74C3C',
    shadowColor: '#E74C3C',
  },
  actionButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  actionButtonText: {
    fontFamily: CustomFonts.syongsyong,
    color: '#fff',
    fontSize: 16,
    letterSpacing: 0.3,
  },
});
