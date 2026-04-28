import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import MapView, { Marker } from "react-native-maps";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";

import { ThemedText } from "@/components/themed-text";
import { CustomFonts, Palette } from "@/constants/theme";
import { EVENT_TYPE_CONFIG } from "@/constants/event-types";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/utils/api";
import type { EventType } from "@/constants/event-types";

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
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuthStore();
  const router = useRouter();

  // Current user id (from JWT)
  const currentUserId = (() => {
    if (!token) return null;
    try {
      return JSON.parse(atob(token.split('.')[1])).sub as number;
    } catch {
      return null;
    }
  })();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isParticipating, setIsParticipating] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);

  useEffect(() => {
    if (!token || !id) return;

    async function fetchEvent() {
      try {
        const res = await apiFetch(`/events/${id}`);
        if (res.ok) {
          const data = await res.json();
          setEvent(data);
          setParticipantCount(data.participantCount);
          setIsParticipating(data.isParticipating);
        }
      } catch (e) {
        console.error("[EventDetail] Failed to fetch:", e);
      } finally {
        setIsLoading(false);
      }
    }

    fetchEvent();
  }, [token, id]);

  const doParticipate = async (join: boolean) => {
    if (!token || !id) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(`/events/${id}/participate`, {
        method: join ? "POST" : "DELETE",
      });
      if (res.ok) {
        setIsParticipating(join);
        setParticipantCount((c) => c + (join ? 1 : -1));
      }
    } catch (e) {
      console.error("[EventDetail] Participation error:", e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleParticipate = () => {
    if (actionLoading) return;

    if (isParticipating) {
      Alert.alert("Leave event", "Are you sure you want to leave this event?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: () => doParticipate(false),
        },
      ]);
    } else {
      doParticipate(true);
    }
  };

  const doDelete = async () => {
    if (!token || !id) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(`/events/${id}`, { method: 'DELETE' });
      if (res.ok) {
        router.replace('/(tabs)/' as any);
      } else {
        Alert.alert('Error', 'Could not delete the event.');
      }
    } catch (e) {
      console.error('[EventDetail] Delete error:', e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = () => {
    if (actionLoading) return;
    Alert.alert(
      'Delete event',
      'Are you sure you want to permanently delete this event?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ],
    );
  };

  const handleContactOrganizer = async () => {
    if (!token || !event?.organizer?.id || !currentUserId || contactLoading) return;
    setContactLoading(true);

    try {
      const res = await apiFetch('/conversations', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantIds: [currentUserId, event.organizer.id],
          type: "PRIVATE",
        }),
      });

      if (res.ok) {
        const conversation = await res.json();
        router.push(`/chat/${conversation.id}` as any);
      } else {
        const body = await res.json().catch(() => ({}));
        console.error("[EventDetail] Contact failed:", res.status, body);
      }
    } catch (e) {
      console.error("[EventDetail] Contact organizer error:", e);
    } finally {
      setContactLoading(false);
    }
  };

  if (isLoading) {
    return (
      <LinearGradient colors={["#EDE7FF", "#F2EDFF"]} style={styles.loader}>
        <ActivityIndicator size="large" color="#B100FF" />
      </LinearGradient>
    );
  }

  if (!event) {
    return (
      <LinearGradient colors={["#EDE7FF", "#F2EDFF"]} style={styles.loader}>
        <ThemedText style={styles.errorText}>Event not found</ThemedText>
      </LinearGradient>
    );
  }

  const config = EVENT_TYPE_CONFIG[event.type];
  const isOwner = currentUserId === event.organizer.id;

  return (
    <LinearGradient colors={["#EDE7FF", "#F2EDFF"]} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Palette.purple} />
          </Pressable>
          <ThemedText style={styles.title}>{event.title}</ThemedText>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: config.color }]}>
              <Ionicons name={config.icon} size={14} color="#fff" />
              <ThemedText style={styles.badgeText}>{config.label}</ThemedText>
            </View>
            {isOwner && (
              <View style={styles.ownerBadge}>
                <Ionicons name="star" size={14} color="#E0A800" />
                <ThemedText style={styles.ownerText}>Your event</ThemedText>
              </View>
            )}
            {!isOwner && isParticipating && (
              <View style={styles.participatingBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#2ecc71" />
                <ThemedText style={styles.participatingText}>
                  Participating
                </ThemedText>
              </View>
            )}
          </View>
        </View>

        {/* Info rows */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons
              name="calendar-outline"
              size={18}
              color={Palette.purple}
            />
            <ThemedText style={styles.infoText}>
              {formatDate(event.date)} at {event.time}
            </ThemedText>
          </View>

          <View style={styles.infoRow}>
            <Ionicons
              name="location-outline"
              size={18}
              color={Palette.purple}
            />
            <ThemedText style={styles.infoText}>{event.address}</ThemedText>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={18} color={Palette.purple} />
            <ThemedText style={styles.infoText}>
              Organized by {event.organizer.username}
            </ThemedText>
            {!isOwner && (
              <>
                <Pressable
              style={({ pressed }) => [
                styles.iconButton,
                pressed && styles.actionButtonPressed,
              ]}
              onPress={() =>
                router.push(`/profile/${event.organizer.id}` as any)
              }
            >
              <Ionicons
                name="person-circle-outline"
                size={24}
                color="rgba(215, 61, 255, 0.45)"
              />
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.iconButton,
                pressed && styles.actionButtonPressed,
              ]}
              onPress={handleContactOrganizer}
              disabled={contactLoading}
            >
              {contactLoading ? (
                <ActivityIndicator size="small" color={Palette.purple} />
              ) : (
                <Image
                  source={require("@/assets/images/chat_unfocused.svg")}
                  style={styles.chatIcon}
                  contentFit="contain"
                />
              )}
            </Pressable>
              </>
            )}
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="people-outline" size={18} color={Palette.purple} />
            <ThemedText style={styles.infoText}>
              {participantCount} participant{participantCount !== 1 ? "s" : ""}
            </ThemedText>
          </View>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>About</ThemedText>
          <ThemedText style={styles.description}>
            {event.description}
          </ThemedText>
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
              }}
            >
              <Marker
                coordinate={{
                  latitude: event.latitude,
                  longitude: event.longitude,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}>
                <Ionicons
                  name="star"
                  size={38}
                  color={
                    isOwner
                      ? '#FFE28A'
                      : isParticipating
                        ? '#98D8C8'
                        : Palette.purple
                  }
                  style={styles.detailMarker}
                />
              </Marker>
            </MapView>
          </View>
        </View>
      </ScrollView>

      {/* Bottom action */}
      <View style={styles.bottomBar}>
        {isOwner ? (
          <View style={styles.ownerActions}>
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.ownerButton,
                pressed && styles.actionButtonPressed,
              ]}
              onPress={() => router.push(`/event/edit/${event.id}` as any)}>
              <Ionicons name="create-outline" size={20} color="#fff" />
              <ThemedText style={styles.actionButtonText}>Edit</ThemedText>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.ownerButton,
                styles.actionButtonLeave,
                pressed && styles.actionButtonPressed,
              ]}
              onPress={handleDelete}
              disabled={actionLoading}>
              {actionLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={20} color="#fff" />
                  <ThemedText style={styles.actionButtonText}>Delete</ThemedText>
                </>
              )}
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              isParticipating && styles.actionButtonLeave,
              pressed && styles.actionButtonPressed,
            ]}
            onPress={handleParticipate}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons
                  name={isParticipating ? "exit-outline" : "hand-left-outline"}
                  size={20}
                  color="#fff"
                />
                <ThemedText style={styles.actionButtonText}>
                  {isParticipating ? "Leave Event" : "Join Event"}
                </ThemedText>
              </>
            )}
          </Pressable>
        )}
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
    alignItems: "center",
    justifyContent: "center",
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
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 28,
    color: Palette.purple,
    lineHeight: 38,
    paddingTop: 4,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },
  badgeText: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 13,
    color: "#fff",
  },
  infoCard: {
    backgroundColor: "rgba(255,255,255,0.7)",
    borderRadius: 16,
    padding: 16,
    gap: 14,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoText: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 14,
    color: Palette.pink,
    flex: 1,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 20,
    color: Palette.purple,
    marginBottom: 8,
    lineHeight: 28,
    paddingTop: 4,
  },
  description: {
    fontFamily: CustomFonts.outfit,
    fontSize: 14,
    color: Palette.pink,
    lineHeight: 22,
  },
  mapContainer: {
    borderRadius: 16,
    overflow: "hidden",
    height: 180,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  detailMarker: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 5,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 34,
    paddingTop: 12,
    backgroundColor: "rgba(237, 231, 255, 0.9)",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  participatingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(46, 204, 113, 0.12)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(46, 204, 113, 0.3)",
  },
  participatingText: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 13,
    color: "#2ecc71",
  },
  ownerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 226, 138, 0.25)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(224, 168, 0, 0.4)",
  },
  ownerText: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 13,
    color: "#E0A800",
  },
  actionButton: {
    backgroundColor: "#7B2FBE",
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#7B2FBE",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  actionButtonLeave: {
    backgroundColor: "#E74C3C",
    shadowColor: "#E74C3C",
  },
  ownerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  ownerButton: {
    flex: 1,
  },
  actionButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  actionButtonText: {
    fontFamily: CustomFonts.syongsyong,
    color: "#fff",
    fontSize: 16,
    letterSpacing: 0.3,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "rgba(207, 126, 242, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(207, 126, 242, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  chatIcon: {
    width: 20,
    height: 20,
  },
});
