import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { ChatMembersSheet } from '@/components/chat-members-sheet';
import { ModerationMenu } from '@/components/moderation-menu';
import { CustomFonts, Palette } from '@/constants/theme';
import { API_URL } from '@/constants/api';
import { apiFetch } from '@/utils/api';
import { useAuthStore } from '@/stores/auth-store';
import {
  composerState,
  conversationTitle,
  fetchConversations,
  type Conversation,
} from '@/utils/conversations';

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
  /** Set once the message has been removed — it stays as a tombstone. */
  deletedAt?: string | null;
  createdAt: string;
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

  /**
   * Re-reads the thread so role changes land straight away — the members sheet
   * calls this after every grant, revoke or removal.
   */
  const refreshConversation = useCallback(async () => {
    const all = await fetchConversations();
    const conv = all?.find((c) => c.id === Number(conversationId));
    if (conv) setConversation(conv);
  }, [conversationId]);

  // Load conversation + messages
  useEffect(() => {
    if (!token || !conversationId) return;
    let cancelled = false;

    async function load() {
      try {
        const [all, msgRes] = await Promise.all([
          fetchConversations(),
          apiFetch(`/conversations/${conversationId}/messages?limit=50`),
        ]);

        const conv = all?.find((c) => c.id === Number(conversationId));
        if (conv && !cancelled) setConversation(conv);
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

    socket.on(
      'messageDeleted',
      (payload: { id: number; deletedAt: string }) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === payload.id
              ? { ...m, text: '', deletedAt: payload.deletedAt }
              : m,
          ),
        );
      },
    );

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

  const headerTitle = conversation
    ? conversationTitle(conversation, currentUserId)
    : 'Chat';

  // Whether the composer is usable, and what to say in its place when it is
  // not. Decided by the API so the client never re-derives the rule.
  const composer = conversation
    ? composerState(conversation)
    : { enabled: false, notice: null };

  /**
   * Offers to remove a message. Authors can always take back their own words;
   * deleting somebody else's needs moderation rights.
   */
  const offerDelete = (message: Message) => {
    if (message.deletedAt) return;
    const mine = message.sender.id === currentUserId;
    if (!mine && !conversation?.canModerate) return;

    Alert.alert(
      mine ? 'Delete your message?' : `Delete ${message.sender.username}'s message?`,
      'It will disappear for everyone in this chat.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            socketRef.current?.emit('deleteMessage', {
              conversationId: Number(conversationId),
              messageId: message.id,
            }),
        },
      ],
    );
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMine = item.sender.id === currentUserId;
    const deleted = Boolean(item.deletedAt);
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
          <Pressable
            onLongPress={() => offerDelete(item)}
            delayLongPress={350}
            disabled={deleted}
            style={[
              styles.bubble,
              isMine ? styles.bubbleMine : styles.bubbleOther,
              deleted && styles.bubbleDeleted,
            ]}>
            {deleted ? (
              // A tombstone rather than a gap: silently dropping the message
              // would reshuffle the thread under whoever is reading it.
              <Text style={styles.deletedText}>Message deleted</Text>
            ) : (
              <Text
                style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
                {item.text}
              </Text>
            )}
          </Pressable>
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
            {otherParticipant ? (
              <ModerationMenu
                targetType="USER"
                targetId={otherParticipant.id}
                targetName={otherParticipant.username}
                canBlock
                onBlocked={() => router.back()}
              />
            ) : (
              // Managing who can post is the owner's job, so only they get the
              // control. The API refuses everyone else regardless.
              (conversation?.canManage || conversation?.canModerate) && (
                <ChatMembersSheet
                  conversation={conversation}
                  currentUserId={currentUserId}
                  onChanged={refreshConversation}
                />
              )
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

        {/* Input — replaced by an explanation when the thread is read-only */}
        {composer.enabled ? (
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
        ) : (
          <View style={styles.readOnlyBar} accessibilityRole="summary">
            <Ionicons
              name="lock-closed-outline"
              size={16}
              color="rgba(207, 126, 242, 0.9)"
            />
            <Text style={styles.readOnlyText}>{composer.notice}</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bubbleDeleted: {
    backgroundColor: 'rgba(207, 126, 242, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.25)',
  },
  deletedText: {
    fontFamily: CustomFonts.outfit,
    fontSize: 13,
    fontStyle: 'italic',
    color: 'rgba(122, 63, 176, 0.65)',
  },
  readOnlyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(207, 126, 242, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(207, 126, 242, 0.3)',
  },
  readOnlyText: {
    flex: 1,
    fontFamily: CustomFonts.outfit,
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(122, 63, 176, 0.95)',
  },
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
