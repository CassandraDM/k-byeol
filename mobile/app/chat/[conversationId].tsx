import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { io, Socket } from 'socket.io-client';

import { ModerationMenu } from '@/components/moderation-menu';
import { CustomFonts, Palette } from '@/constants/theme';
import { API_URL } from '@/constants/api';
import { apiFetch } from '@/utils/api';
import { useAuthStore } from '@/stores/auth-store';

interface Sender {
  id: number;
  username: string;
  avatar: string | null;
}

interface Message {
  id: number;
  conversationId: number;
  sender: Sender;
  text: string;
  createdAt: string;
}

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
  participants: Participant[];
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatThreadScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
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

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  // Load conversation + messages
  useEffect(() => {
    if (!token || !conversationId) return;
    let cancelled = false;

    async function load() {
      try {
        const [convRes, msgRes] = await Promise.all([
          apiFetch('/conversations'),
          apiFetch(`/conversations/${conversationId}/messages?limit=50`),
        ]);

        if (convRes.ok) {
          const all = (await convRes.json()) as Conversation[];
          const conv = all.find((c) => c.id === Number(conversationId));
          if (conv && !cancelled) setConversation(conv);
        }
        if (msgRes.ok) {
          const msgs = (await msgRes.json()) as Message[];
          // API returns desc, we reverse to asc for chronological display
          if (!cancelled) setMessages(msgs.reverse());
        }
      } catch (e) {
        console.error('[Chat] Load error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token, conversationId]);

  // Connect to WebSocket
  useEffect(() => {
    if (!token || !conversationId) return;

    const socket = io(API_URL, {
      auth: { token },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('joinConversation', {
        conversationId: Number(conversationId),
      });
    });

    socket.on('newMessage', (msg: Message) => {
      setMessages((prev) => {
        // Avoid duplicates
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    });

    socket.on('error', (err: { message: string }) => {
      console.warn('[Chat] Socket error:', err.message);
    });

    return () => {
      socket.emit('leaveConversation', {
        conversationId: Number(conversationId),
      });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, conversationId]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const socket = socketRef.current;
    if (!socket?.connected) return;

    setSending(true);
    socket.emit('sendMessage', {
      conversationId: Number(conversationId),
      text: trimmed,
    });
    setText('');
    setSending(false);
  };

  // In a 1-on-1 the other participant is the block target. Group and crew
  // threads have no single "them", so moderation happens from each profile.
  const otherParticipant =
    conversation?.type === 'PRIVATE'
      ? (conversation.participants.find((p) => p.id !== currentUserId) ?? null)
      : null;

  // Compute header title
  const headerTitle = (() => {
    if (!conversation) return 'Chat';
    if (conversation.type === 'PRIVATE') {
      const other = conversation.participants.find(
        (p) => p.id !== currentUserId,
      );
      return other?.username ?? 'Chat';
    }
    return conversation.name ?? 'Group chat';
  })();

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMine = item.sender.id === currentUserId;
    const prev = index > 0 ? messages[index - 1] : null;
    const showSender =
      !isMine && (!prev || prev.sender.id !== item.sender.id);

    return (
      <View
        style={[
          styles.messageWrapper,
          isMine ? styles.wrapperMine : styles.wrapperOther,
        ]}>
        {showSender && (
          <Text style={styles.senderName}>{item.sender.username}</Text>
        )}

        <View style={styles.bubbleLine}>
          {!isMine && (
            <View style={styles.avatarSlot}>
              {showSender &&
                (item.sender.avatar ? (
                  <Image
                    source={{ uri: item.sender.avatar }}
                    style={styles.msgAvatar}
                  />
                ) : (
                  <View style={[styles.msgAvatar, styles.msgAvatarFallback]}>
                    <Ionicons name="person" size={14} color="#fff" />
                  </View>
                ))}
            </View>
          )}
          <View
            style={[
              styles.bubble,
              isMine ? styles.bubbleMine : styles.bubbleOther,
            ]}>
            <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
              {item.text}
            </Text>
          </View>
        </View>

        <Text
          style={[
            styles.timestamp,
            isMine ? styles.timestampMine : styles.timestampOther,
          ]}>
          {formatTime(item.createdAt)}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <LinearGradient colors={['#EDE7FF', '#F2EDFF']} style={styles.loader}>
        <ActivityIndicator size="large" color={Palette.purple} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#EDE7FF', '#F2EDFF']} style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconSlot}>
            <Ionicons name="chevron-back" size={28} color={Palette.purple} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {headerTitle}
          </Text>
          <View style={styles.iconSlot}>
            {otherParticipant && (
              <ModerationMenu
                targetType="USER"
                targetId={otherParticipant.id}
                targetName={otherParticipant.username}
                canBlock
                onBlocked={() => router.back()}
              />
            )}
          </View>
        </View>

        {/* Messages */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id.toString()}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: false })
          }
        />

        {/* Input */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Type something..."
            placeholderTextColor="rgba(207, 126, 242, 0.5)"
            multiline
          />
          <Pressable
            style={({ pressed }) => [
              styles.sendButton,
              pressed && styles.sendPressed,
              !text.trim() && styles.sendDisabled,
            ]}
            onPress={handleSend}
            disabled={!text.trim() || sending}>
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  iconSlot: {
    width: 40,
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
  messagesContent: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 16,
    gap: 4,
  },
  messageWrapper: {
    maxWidth: '85%',
  },
  wrapperMine: {
    alignSelf: 'flex-end',
  },
  wrapperOther: {
    alignSelf: 'flex-start',
  },
  bubbleLine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  avatarSlot: {
    width: 28,
    alignItems: 'center',
    marginBottom: 12,
  },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  msgAvatarFallback: {
    backgroundColor: Palette.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  senderName: {
    fontFamily: CustomFonts.moyamoya,
    fontSize: 12,
    color: Palette.purple,
    marginLeft: 36,
    marginBottom: 2,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    flexShrink: 1,
  },
  bubbleOther: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 4,
  },
  bubbleMine: {
    backgroundColor: '#CF7EF2',
    borderTopRightRadius: 4,
  },
  bubbleText: {
    fontFamily: CustomFonts.outfit,
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  bubbleTextMine: {
    color: '#fff',
  },
  timestamp: {
    fontFamily: CustomFonts.outfit,
    fontSize: 10,
    color: Palette.pink,
    marginTop: 2,
  },
  timestampOther: {
    marginLeft: 36,
  },
  timestampMine: {
    alignSelf: 'flex-end',
    marginRight: 6,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    backgroundColor: 'rgba(242, 237, 255, 0.9)',
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontFamily: CustomFonts.outfit,
    fontSize: 14,
    color: '#333',
    maxHeight: 100,
    minHeight: 40,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#CF7EF2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.95 }],
  },
  sendDisabled: {
    opacity: 0.5,
  },
});
