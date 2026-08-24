import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { CustomFonts, Palette } from "@/constants/theme";
import { apiFetch } from "@/utils/api";
import { useAuthStore } from "@/stores/auth-store";
import { EventType } from "@/constants/event-types";

interface Fandom {
  id: number;
  name: string;
  slug: string;
}

interface Profile {
  id: number;
  username: string;
  email: string;
  avatar: string | null;
  bio: string | null;
  createdAt: string;
  city: { code: string; name: string; postalCode: string } | null;
  fandoms: Fandom[];
}

interface UserEvent {
  id: number;
  title: string;
  type: EventType;
  address: string;
  date: string;
  time: string;
  description: string;
  imageUrl: string | null;
  participantCount: number;
  isOrganizer: boolean;
}

interface EventsResponse {
  upcoming: UserEvent[];
  past: UserEvent[];
}

interface ProfileContentProps {
  userId: number;
  isOwnProfile: boolean;
  showHeaderActions?: boolean;
  onboardingCompleted?: boolean;
  onCompleteProfile?: () => void;
}

function formatJoinDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatMemberSince(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function ProfileContent({
  userId,
  isOwnProfile,
  showHeaderActions,
  onboardingCompleted,
  onCompleteProfile,
}: ProfileContentProps) {
  const router = useRouter();
  const { token } = useAuthStore();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [events, setEvents] = useState<EventsResponse>({
    upcoming: [],
    past: [],
  });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!token || !userId) return;
    try {
      const [profileRes, eventsRes] = await Promise.all([
        apiFetch(`/users/${userId}`),
        apiFetch(`/users/${userId}/events`),
      ]);
      if (profileRes.ok) setProfile(await profileRes.json());
      if (eventsRes.ok) setEvents(await eventsRes.json());
    } catch (e) {
      console.error("[ProfileContent] Load error:", e);
    } finally {
      setLoading(false);
    }
  }, [token, userId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData]),
  );

  if (loading || !profile) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={Palette.purple} />
      </View>
    );
  }

  const organizedUpcoming = events.upcoming
    .filter((e) => e.isOrganizer)
    .slice(0, 3);
  const participatingUpcoming = events.upcoming
    .filter((e) => !e.isOrganizer)
    .slice(0, 3);
  const ownerLabel = isOwnProfile ? "me" : profile.username;

  const renderEventCard = (event: UserEvent) => {
    return (
      <Pressable
        key={event.id}
        style={({ pressed }) => [styles.eventCard, pressed && styles.pressed]}
        onPress={() => router.push(`/event/${event.id}` as any)}
      >
        {event.imageUrl && (
          <Image source={{ uri: event.imageUrl }} style={styles.eventImage} />
        )}
        <View style={styles.eventBody}>
          <Text style={styles.eventTitle} numberOfLines={2}>
            {event.title}
          </Text>
          <Text style={styles.eventDescription} numberOfLines={2}>
            {event.address}
          </Text>
          {event.isOrganizer && event.description && (
            <>
              <Text style={styles.eventHostLabel}>
                Note from {profile.username}:
              </Text>
              <Text style={styles.eventHost} numberOfLines={3}>
                {event.description}
              </Text>
            </>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View>
      {/* Header with settings (own profile only) */}
      {showHeaderActions && (
        <View style={styles.header}>
          <View style={styles.iconSlot} />
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={styles.headerActions}>
            {isOwnProfile && (
              <Pressable
                onPress={() => router.push("/settings" as any)}
                style={styles.iconSlot}
                hitSlop={8}
              >
                <Ionicons
                  name="settings-outline"
                  size={22}
                  color={Palette.purple}
                />
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Identity row */}
      <View style={styles.identityRow}>
        {profile.avatar ? (
          <Image
            source={{ uri: profile.avatar }}
            style={styles.avatar}
            onError={(e) =>
              console.warn(
                "[Profile] Avatar failed to load:",
                profile.avatar,
                e.nativeEvent,
              )
            }
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Ionicons name="person" size={44} color="#fff" />
          </View>
        )}
        <View style={styles.identityInfo}>
          <Text style={styles.username} numberOfLines={1}>
            {profile.username}
          </Text>
          <Text style={styles.metaText}>
            Member since{" "}
            <Text style={styles.metaBold}>
              {formatMemberSince(profile.createdAt)}
            </Text>
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              <Text style={styles.metaCount}>0</Text> Following
            </Text>
            <Text style={styles.metaText}>
              <Text style={styles.metaCount}>0</Text> Followers
            </Text>
          </View>
        </View>
      </View>

      {/* Complete profile notice — under identity */}
      {isOwnProfile && onboardingCompleted === false && onCompleteProfile && (
        <Pressable
          style={({ pressed }) => [
            styles.noticeCard,
            pressed && styles.pressed,
          ]}
          onPress={onCompleteProfile}
        >
          <Ionicons
            name="alert-circle-outline"
            size={22}
            color={Palette.purple}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeTitle}>Complete your profile</Text>
            <Text style={styles.noticeSubtitle}>
              Add your picture, city & favorite groups
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Palette.purple} />
        </Pressable>
      )}

      {/* Description */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Description</Text>
        <View style={styles.card}>
          {profile.bio ? (
            <Text style={styles.cardText}>{profile.bio}</Text>
          ) : (
            <Text style={[styles.cardText, styles.muted]}>
              No description yet
            </Text>
          )}
          {profile.city && (
            <View style={styles.infoRow}>
              <Ionicons
                name="location-outline"
                size={14}
                color={Palette.purple}
              />
              <Text style={styles.infoText}>{profile.city.name}, France</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Ionicons name="mail-outline" size={14} color={Palette.purple} />
            <Text style={styles.infoText}>{profile.email}</Text>
          </View>
          {/* Creation date — only for crews */}
        </View>
      </View>

      {/* Fandoms */}
      {profile.fandoms.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fandoms</Text>
          <View style={styles.fandomWrap}>
            {profile.fandoms.map((f) => (
              <View key={f.id} style={styles.fandomChip}>
                <Text style={styles.fandomText}>{f.name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Organised by */}
      {organizedUpcoming.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Organised by {ownerLabel}</Text>
          <View style={{ gap: 10 }}>
            {organizedUpcoming.map(renderEventCard)}
          </View>
        </View>
      )}

      {/* Next event(s) the user participates in */}
      {participatingUpcoming.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {participatingUpcoming.length > 1 ? "Next events" : "Next event"}
          </Text>
          <View style={{ gap: 10 }}>
            {participatingUpcoming.map(renderEventCard)}
          </View>
        </View>
      )}


    </View>
  );
}

const styles = StyleSheet.create({
  loader: {
    paddingVertical: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconSlot: {
    width: 32,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: CustomFonts.moyamoya,
    fontSize: 32,
    color: Palette.purple,
    lineHeight: 42,
    paddingTop: 4,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 8,
  },
  avatar: {
    width: 82,
    height: 82,
    borderRadius: 41,
  },
  avatarFallback: {
    backgroundColor: Palette.purple,
    alignItems: "center",
    justifyContent: "center",
  },
  identityInfo: {
    flex: 1,
    gap: 6,
  },
  username: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 22,
    color: Palette.purple,
  },
  metaRow: {
    flexDirection: "row",
    gap: 14,
    flexWrap: "wrap",
  },
  metaText: {
    fontFamily: CustomFonts.outfit,
    fontSize: 12,
    color: Palette.pink,
  },
  metaBold: {
    fontFamily: CustomFonts.outfitSemiBold,
    color: Palette.purple,
  },
  metaCount: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 13,
    color: Palette.purple,
  },
  section: {
    marginTop: 20,
    gap: 8,
  },
  noticeCard: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(207, 126, 242, 0.1)",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Palette.purple,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  noticeTitle: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 16,
    color: Palette.purple,
  },
  noticeSubtitle: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 12,
    color: Palette.pink,
    marginTop: 2,
  },
  sectionTitle: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 18,
    color: Palette.purple,
    lineHeight: 26,
    paddingTop: 2,
  },
  card: {
    backgroundColor: "rgba(207, 126, 242, 0.12)",
    borderRadius: 14,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(207, 126, 242, 0.2)",
  },
  cardText: {
    fontFamily: CustomFonts.outfit,
    fontSize: 14,
    color: Palette.pink,
  },
  muted: {
    color: Palette.pink,
    fontStyle: "italic",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoText: {
    fontFamily: CustomFonts.outfit,
    fontSize: 13,
    color: Palette.pink,
    flex: 1,
  },
  fandomWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  fandomChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(207, 126, 242, 0.15)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(207, 126, 242, 0.3)",
  },
  fandomText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 13,
    color: Palette.purple,
  },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(207, 126, 242, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(207, 126, 242, 0.2)",
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  eventImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: "hidden",
  },
  eventBody: {
    flex: 1,
    gap: 4,
  },
  eventTitle: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 15,
    color: Palette.purple,
  },
  eventHost: {
    fontFamily: CustomFonts.outfit,
    fontSize: 12,
    color: Palette.pink,
  },
  eventHostLabel: {
    fontFamily: CustomFonts.moyamoya,
    color: Palette.pink,
  },
  eventDescription: {
    fontFamily: CustomFonts.outfit,
    fontSize: 12,
    color: Palette.pink,
  },
});
