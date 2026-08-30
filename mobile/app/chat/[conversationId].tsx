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
import * as Haptics from 'expo-haptics';

import { ChatMembersSheet } from '@/components/chat-members-sheet';
import {
  MessageActionsMenu,
  type MessageAction,
  type MessageRect,
} from '@/components/message-actions-menu';
import { UndoToast } from '@/components/undo-toast';
import { ModerationMenu } from '@/components/moderation-menu';
import { CustomFonts, Palette } from '@/constants/theme';
import { API_URL } from '@/constants/api';
import { apiFetch } from '@/utils/api';
import { useAuthStore } from '@/stores/auth-store';
import {
  composerState,
  conversationTitle,
  deleteMessage,
  editMessage,
  fetchConversations,
  formatMessageStamp,
  insertMessage,
  messageActions,
  restoreMessage,
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
  /** Set once the author rewrote it. */
  editedAt?: string | null;
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
  /** The message being rewritten, if any — the composer doubles as its editor. */
  const [editing, setEditing] = useState<Message | null>(null);
  /** The long-pressed message and where the press landed, while its menu is up. */
  const [menu, setMenu] = useState<{
    message: Message;
    rect: MessageRect;
  } | null>(null);
  /** The message just deleted, while its undo offer stands. */
  const [undoable, setUndoable] = useState<Message | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  /** Each rendered bubble, so the long press can measure the one it hit. */
  const bubbleRefs = useRef(new Map<number, View>());

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
      'messageEdited',
      (payload: { id: number; text: string; editedAt: string }) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === payload.id
              ? { ...m, text: payload.text, editedAt: payload.editedAt }
              : m,
          ),
        );
      },
    );

    socket.on('messageDeleted', (payload: { id: number }) => {
      setMessages((prev) => prev.filter((m) => m.id !== payload.id));
    });

    socket.on('messageRestored', (message: Message) => {
      // Back where it was sent, not at the end — it predates whatever arrived
      // while it was gone.
      setMessages((prev) => insertMessage(prev, message));
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

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    // The composer doubles as the editor: while a message is being rewritten,
    // sending saves it instead of posting a new one.
    if (editing) {
      void saveEdit(editing, trimmed);
      return;
    }

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

  const saveEdit = async (message: Message, next: string) => {
    if (next === message.text) {
      cancelEdit();
      return;
    }
    setSending(true);
    const updated = await editMessage(message.id, next);
    setSending(false);

    if (!updated) {
      Alert.alert('Not saved', 'Could not edit that message. Try again.');
      return;
    }
    // The socket tells everyone else; this keeps the author's own screen from
    // waiting on the round trip.
    setMessages((prev) =>
      prev.map((m) =>
        m.id === message.id
          ? { ...m, text: updated.text, editedAt: updated.editedAt }
          : m,
      ),
    );
    cancelEdit();
  };

  const startEdit = (message: Message) => {
    setEditing(message);
    setText(message.text);
  };

  const cancelEdit = () => {
    setEditing(null);
    setText('');
  };

  /**
   * Deletes straight away and offers a few seconds to take it back.
   *
   * No confirmation dialog: the undo is the safety net, and asking twice for
   * something instantly reversible is friction for nothing. The message leaves
   * the thread immediately so the deletion looks like it happened.
   */
  const handleDelete = async (message: Message) => {
    if (editing?.id === message.id) cancelEdit();

    setMessages((prev) => prev.filter((m) => m.id !== message.id));
    setUndoable(message);

    const ok = await deleteMessage(message.id);
    if (!ok) {
      // It never went: put it back and say so, rather than leaving a thread
      // that disagrees with the server.
      setUndoable(null);
      setMessages((prev) => insertMessage(prev, message));
      Alert.alert('Not deleted', 'Could not delete that message. Try again.');
    }
  };

  const handleUndo = async () => {
    const message = undoable;
    setUndoable(null);
    if (!message) return;

    const ok = await restoreMessage(message.id);
    if (ok) {
      setMessages((prev) => insertMessage(prev, message));
    } else {
      Alert.alert('Not restored', 'Could not bring that message back.');
    }
  };

  /**
   * Opens the long-press menu, anchored where the finger landed.
   *
   * Nothing opens on a message this person cannot act on — an empty menu is
   * worse than no menu, and a tombstone has nothing left to offer.
   */
  const openMenu = (message: Message, rect: MessageRect) => {
    const allowed = messageActions(message, currentUserId, conversation);
    if (!allowed.canEdit && !allowed.canDelete) return;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMenu({ message, rect });
  };

  /** What the open menu offers, built from what this person may do. */
  const menuActions = ((): MessageAction[] => {
    if (!menu) return [];
    const allowed = messageActions(menu.message, currentUserId, conversation);
    const message = menu.message;

    return [
      ...(allowed.canEdit
        ? [
            {
              key: 'edit',
              label: 'Edit',
              icon: 'pencil-outline' as const,
              onPress: () => startEdit(message),
            },
          ]
        : []),
      ...(allowed.canDelete
        ? [
            {
              key: 'delete',
              label: 'Delete',
              icon: 'trash-outline' as const,
              destructive: true,
              onPress: () => void handleDelete(message),
            },
          ]
        : []),
    ];
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
          <Pressable
            ref={(node) => {
              if (node) bubbleRefs.current.set(item.id, node);
              else bubbleRefs.current.delete(item.id);
            }}
            onLongPress={() => {
              bubbleRefs.current
                .get(item.id)
                ?.measureInWindow((x, y, width, height) =>
                  openMenu(item, { x, y, width, height }),
                );
            }}
            delayLongPress={350}
            style={[
              styles.bubble,
              isMine ? styles.bubbleMine : styles.bubbleOther,
            ]}>
            <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
              {item.text}
            </Text>
          </Pressable>
        </View>

        <Text
          style={[
            styles.timestamp,
            isMine ? styles.timestampMine : styles.timestampOther,
          ]}>
          {formatTime(item.createdAt)}
          {item.editedAt && <Text style={styles.editedLabel}> · edited</Text>}
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

        <UndoToast
          message={undoable ? 'Message deleted' : null}
          onUndo={() => void handleUndo()}
          onDismiss={() => setUndoable(null)}
        />

        {/* Input — replaced by an explanation when the thread is read-only */}
        {composer.enabled ? (
          <>
            {/* Says which message is being rewritten, and how to back out. */}
            {editing && (
              <View style={styles.editingBanner}>
                <Ionicons
                  name="pencil"
                  size={14}
                  color={Palette.purple}
                />
                <Text style={styles.editingText} numberOfLines={1}>
                  Editing your message
                </Text>
                <Pressable onPress={cancelEdit} hitSlop={8}>
                  <Text style={styles.editingCancel}>Cancel</Text>
                </Pressable>
              </View>
            )}
            <View style={styles.inputBar}>
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder={
                  editing ? 'Rewrite your message...' : 'Type something...'
                }
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
                <Ionicons
                  name={editing ? 'checkmark' : 'send'}
                  size={18}
                  color="#fff"
                />
              </Pressable>
            </View>
          </>
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

      <MessageActionsMenu
        anchor={menu?.rect ?? null}
        align={menu?.message.sender.id === currentUserId ? 'right' : 'left'}
        highlight={
          menu && (
            <View
              style={[
                styles.bubble,
                menu.message.sender.id === currentUserId
                  ? styles.bubbleMine
                  : styles.bubbleOther,
              ]}>
              <Text
                style={[
                  styles.bubbleText,
                  menu.message.sender.id === currentUserId &&
                    styles.bubbleTextMine,
                ]}>
                {menu.message.text}
              </Text>
            </View>
          )
        }
        timestamp={
          menu ? formatMessageStamp(menu.message.createdAt) : undefined
        }
        actions={menuActions}
        onClose={() => setMenu(null)}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  editedLabel: {
    fontFamily: CustomFonts.outfit,
    fontSize: 10,
    fontStyle: 'italic',
  },
  editingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(207, 126, 242, 0.14)',
  },
  editingText: {
    flex: 1,
    fontFamily: CustomFonts.outfit,
    fontSize: 12,
    color: Palette.purple,
  },
  editingCancel: {
    fontFamily: CustomFonts.syongsyong,
    fontSize: 14,
    color: Palette.purple,
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
