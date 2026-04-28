import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CustomFonts, Palette } from '@/constants/theme';
import { apiFetch } from '@/utils/api';
import { useAuthStore } from '@/stores/auth-store';

interface Participant {
  id: number;
  username: string;
  avatar: string | null;
  role: string;
}

interface Conversation {
  id: number;
  type: 'PRIVATE' | 'GROUP' | 'CREW';
  name: string | null;
  ownerId: number | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  participants: Participant[];
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function ChatScreen() {
  const { token } = useAuthStore();
  const router = useRouter();

  const currentUserId = (() => {
    if (!token) return null;
    try {
      return JSON.parse(atob(token.split('.')[1])).sub as number;
    } catch {
      return null;
    }
  })();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let cancelled = false;
      async function load() {
        try {
          const res = await apiFetch('/conversations');
          if (res.ok) {
            const data = await res.json();
            if (!cancelled) setConversations(data);
          }
        } catch (e) {
          console.error('[Chat] Failed to fetch:', e);
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [token]),
  );

  const renderItem = ({ item }: { item: Conversation }) => {
    // For PRIVATE conversations: show the other participant
    const other =
      item.type === 'PRIVATE'
        ? item.participants.find((p) => p.id !== currentUserId)
        : null;

    const title = item.name ?? other?.username ?? 'Conversation';
    const avatar = other?.avatar ?? null;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.conversationItem,
          pressed && styles.conversationPressed,
        ]}
        onPress={() => router.push(`/chat/${item.id}` as any)}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Ionicons
              name={item.type === 'PRIVATE' ? 'person' : 'people'}
              size={22}
              color="#fff"
            />
          </View>
        )}

        <View style={styles.conversationBody}>
          <View style={styles.conversationHeader}>
            <Text style={styles.conversationName} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.conversationTime}>
              {formatRelative(item.lastMessageAt)}
            </Text>
          </View>
          <Text style={styles.conversationPreview} numberOfLines={1}>
            {item.lastMessageText ?? 'No messages yet'}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ width: 40 }} />
        <Text style={styles.headerTitle}>Chats</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={Palette.purple} />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={48} color={Palette.purple} />
          <Text style={styles.emptyText}>No conversations yet</Text>
          <Text style={styles.emptySubtext}>
            Start by contacting an event organizer!
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 32,
    color: Palette.purple,
    lineHeight: 42,
    paddingTop: 4,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 18,
    color: Palette.purple,
    marginTop: 8,
  },
  emptySubtext: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 14,
    color: Palette.pink,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 100,
  },
  separator: {
    height: 8,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.2)',
  },
  conversationPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarFallback: {
    backgroundColor: Palette.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conversationBody: {
    flex: 1,
    gap: 2,
  },
  conversationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  conversationName: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 16,
    color: Palette.purple,
    flex: 1,
  },
  conversationTime: {
    fontFamily: CustomFonts.outfit,
    fontSize: 12,
    color: Palette.pink,
  },
  conversationPreview: {
    fontFamily: CustomFonts.outfit,
    fontSize: 13,
    color: '#777',
  },
});
