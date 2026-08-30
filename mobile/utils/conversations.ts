import { apiFetch } from '@/utils/api';

export type ConversationType = 'PRIVATE' | 'GROUP' | 'CREW';
export type ParticipantRole =
  | 'MEMBER'
  | 'WRITER'
  | 'MODERATOR'
  | 'ADMIN'
  | 'OWNER';

/** The roles an organizer (or co-organizer) can actually hand out. */
export type AssignableRole = Exclude<ParticipantRole, 'OWNER'>;

export interface ConversationParticipant {
  id: number;
  username: string;
  avatar: string | null;
  role: ParticipantRole;
  /** Silenced right now — the API resolves any expiry before sending this. */
  isMuted: boolean;
  mutedUntil: string | null;
}

export interface Conversation {
  id: number;
  type: ConversationType;
  name: string | null;
  ownerId: number | null;
  /** Set when this thread is an event's group chat. */
  eventId: number | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  /** The viewer's own role in this thread. */
  myRole: ParticipantRole | null;
  /** True when only privileged participants may post. */
  isRestricted: boolean;
  /** What the viewer's role allows, before any mute. */
  roleAllowsWrite: boolean;
  /** Whether the viewer may post right now. Decided by the API, not re-derived. */
  canWrite: boolean;
  /** Whether the viewer may delete other people's messages. */
  canModerate: boolean;
  /** Whether the viewer may set other people's roles. */
  canManage: boolean;
  isOwner: boolean;
  /** The viewer's own mute, so the composer can explain itself. */
  isMuted: boolean;
  mutedUntil: string | null;
  participants: ConversationParticipant[];
}

/** How each role is described to the people using the app. */
export const ROLE_LABELS: Record<ParticipantRole, string> = {
  OWNER: 'Organiser',
  ADMIN: 'Admin',
  MODERATOR: 'Moderator',
  WRITER: 'Writer',
  MEMBER: 'Reader',
};

/** One line explaining what each role may actually do. */
export const ROLE_DESCRIPTIONS: Record<AssignableRole, string> = {
  ADMIN: 'Can post, moderate, and set everyone else’s role.',
  MODERATOR: 'Can post, delete messages, and mute or remove people.',
  WRITER: 'Can post in the chat.',
  MEMBER: 'Can read the chat only.',
};

/** Offered in the role picker, most powerful first. Owner is not assignable. */
export const ASSIGNABLE_ROLES: AssignableRole[] = [
  'ADMIN',
  'MODERATOR',
  'WRITER',
  'MEMBER',
];

/** What the composer should do, and what to tell the reader if it is locked. */
export interface ComposerState {
  enabled: boolean;
  /** Shown in place of the input. Null when the composer is usable. */
  notice: string | null;
}

/**
 * Whether the viewer can type, and the explanation when they cannot.
 *
 * A disabled input with no explanation reads as a bug, so every locked state
 * carries a reason and says the messages are still readable. A mute is
 * reported ahead of the role: it is the more surprising of the two, and the
 * one with an end date worth naming.
 */
export function composerState(conversation: Conversation): ComposerState {
  if (conversation.canWrite) return { enabled: true, notice: null };

  if (conversation.isMuted) {
    // The role is suspended, not taken away — it returns when the mute lifts.
    return {
      enabled: false,
      notice: conversation.mutedUntil
        ? `You are muted until ${formatMuteDeadline(conversation.mutedUntil)}, so the chat is read-only for you until then.`
        : 'You have been muted, so the chat is read-only for you until a moderator lifts it.',
    };
  }
  if (conversation.eventId !== null) {
    return {
      enabled: false,
      notice:
        'Only the organiser can post here. You will still see every message.',
    };
  }
  if (conversation.isRestricted) {
    return {
      enabled: false,
      notice:
        'Only the owner and its writers can post here. You will still see every message.',
    };
  }
  return { enabled: false, notice: 'You cannot post in this conversation.' };
}

/** A mute deadline, written the way somebody would say it out loud. */
export function formatMuteDeadline(iso: string): string {
  const until = new Date(iso);
  const today = new Date();
  const sameDay = until.toDateString() === today.toDateString();
  const time = until.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (sameDay) return time;
  return `${until.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
}

/**
 * The name to show for a thread.
 *
 * A direct thread is named after the other person; everything else carries its
 * own name. Shared by the list and the thread header, which had drifted into
 * two slightly different versions of this.
 */
export function conversationTitle(
  conversation: Pick<Conversation, 'type' | 'name' | 'participants'>,
  currentUserId: number | null,
): string {
  if (conversation.type === 'PRIVATE') {
    const other = conversation.participants.find((p) => p.id !== currentUserId);
    return other?.username ?? 'Conversation';
  }
  return conversation.name ?? 'Group chat';
}

/** True when this thread is an event's group chat. */
export function isEventChat(
  conversation: Pick<Conversation, 'eventId'>,
): boolean {
  return conversation.eventId !== null;
}

/** Seniority, mirroring the server's. Higher acts on lower. */
const RANK: Record<ParticipantRole, number> = {
  MEMBER: 0,
  WRITER: 1,
  MODERATOR: 2,
  ADMIN: 3,
  OWNER: 4,
};

/**
 * Sorts a thread's members most senior first, then alphabetically — the order
 * the management sheet wants.
 */
export function sortedMembers(
  participants: ConversationParticipant[],
): ConversationParticipant[] {
  return [...participants].sort(
    (a, b) =>
      RANK[b.role] - RANK[a.role] || a.username.localeCompare(b.username),
  );
}

/**
 * Whether the viewer may mute or remove this member.
 *
 * Mirrors the server rule so the controls stay hidden rather than failing on
 * tap — the API is still the one that decides.
 */
export function canActOn(
  conversation: Conversation,
  member: ConversationParticipant,
): boolean {
  if (!conversation.canModerate) return false;
  if (member.role === 'OWNER') return false;
  const mine = conversation.myRole;
  if (!mine) return false;
  if (RANK[mine] >= RANK.ADMIN) return true;
  return RANK[mine] > RANK[member.role];
}

/** Whether the viewer may change this member's role. */
export function canSetRoleOf(
  conversation: Conversation,
  member: ConversationParticipant,
): boolean {
  return conversation.canManage && member.role !== 'OWNER';
}

/** Sets a participant's role. */
export async function setParticipantRole(
  conversationId: number,
  userId: number,
  role: AssignableRole,
): Promise<boolean> {
  return write(
    `/conversations/${conversationId}/participants/${userId}/role`,
    'PUT',
    { role },
  );
}

/**
 * Silences somebody. `minutes` omitted means the mute has no end date — that
 * is what muting "definitively" is, rather than a date far in the future.
 */
export async function muteParticipant(
  conversationId: number,
  userId: number,
  minutes?: number,
): Promise<boolean> {
  return write(
    `/conversations/${conversationId}/participants/${userId}/mute`,
    'POST',
    minutes === undefined ? {} : { minutes },
  );
}

/** Lifts a mute, timed or not. */
export async function unmuteParticipant(
  conversationId: number,
  userId: number,
): Promise<boolean> {
  return write(
    `/conversations/${conversationId}/participants/${userId}/mute`,
    'DELETE',
  );
}

/** Removes somebody from the thread. They keep their place at the event. */
export async function removeFromConversation(
  conversationId: number,
  userId: number,
): Promise<boolean> {
  return write(
    `/conversations/${conversationId}/participants/${userId}`,
    'DELETE',
  );
}

async function write(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<boolean> {
  try {
    const res = await apiFetch(path, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
    if (!res.ok) {
      console.error(`[conversations] ${method} ${path} failed →`, res.status);
    }
    return res.ok;
  } catch (e) {
    console.error(`[conversations] ${method} ${path} error →`, e);
    return false;
  }
}

/** One message as the thread renders it. */
export interface ChatMessage {
  id: number;
  conversationId: number;
  sender: { id: number; username: string; avatar: string | null };
  text: string;
  /** Set once the author rewrote it. */
  editedAt?: string | null;
  /** Set once it was removed — it stays as a tombstone. */
  deletedAt?: string | null;
  createdAt: string;
}

/**
 * When a message was sent, written for the header of the long-press menu.
 *
 * Relative for the last two days, because "yesterday at 22:35" is how people
 * actually place a message; absolute beyond that, where the day of the week
 * stops being useful.
 */
export function formatMessageStamp(iso: string, now: Date = new Date()): string {
  const sent = new Date(iso);
  const time = sent.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const dayStart = midnight.getTime();
  const sentAt = sent.getTime();

  if (sentAt >= dayStart) return `Today at ${time}`;
  if (sentAt >= dayStart - 86_400_000) return `Yesterday at ${time}`;

  return `${sent.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })} at ${time}`;
}

/** What the long-press menu should offer for a message, in order. */
export interface MessageActions {
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * Which of edit and delete to offer on a message.
 *
 * Editing is the author's alone — a moderator taking a message down is visible
 * to everyone as a tombstone, but rewriting somebody else's words would leave
 * no trace at all. Deleting follows the thread's moderation rights.
 */
export function messageActions(
  message: Pick<ChatMessage, 'sender' | 'deletedAt'>,
  currentUserId: number | null,
  conversation: Pick<Conversation, 'canModerate'> | null,
): MessageActions {
  // A tombstone has nothing left to act on.
  if (message.deletedAt) return { canEdit: false, canDelete: false };

  const mine = currentUserId !== null && message.sender.id === currentUserId;
  return {
    canEdit: mine,
    canDelete: mine || Boolean(conversation?.canModerate),
  };
}

/** Rewrites a message. Returns the updated row, or null on failure. */
export async function editMessage(
  messageId: number,
  text: string,
): Promise<ChatMessage | null> {
  try {
    const res = await apiFetch(`/messages/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.error('[messages] Edit failed →', res.status);
      return null;
    }
    return (await res.json()) as ChatMessage;
  } catch (e) {
    console.error('[messages] Edit error →', e);
    return null;
  }
}

/** Removes a message. */
export async function deleteMessage(messageId: number): Promise<boolean> {
  return write(`/messages/${messageId}`, 'DELETE');
}

/** Puts a deleted message back. Only whoever deleted it may. */
export async function restoreMessage(messageId: number): Promise<boolean> {
  return write(`/messages/${messageId}/restore`, 'POST');
}

/**
 * Puts a message back where it belongs in a thread ordered oldest-first.
 *
 * A restored message is not simply appended: it was sent before whatever
 * arrived while it was gone, and tacking it on the end would put a reply
 * before the thing it answers.
 */
export function insertMessage<T extends { id: number; createdAt: string }>(
  messages: T[],
  message: T,
): T[] {
  if (messages.some((m) => m.id === message.id)) return messages;

  const at = messages.findIndex(
    (m) => new Date(m.createdAt).getTime() > new Date(message.createdAt).getTime(),
  );
  if (at === -1) return [...messages, message];
  return [...messages.slice(0, at), message, ...messages.slice(at)];
}

/** The viewer's conversations. Null means the read failed. */
export async function fetchConversations(): Promise<Conversation[] | null> {
  try {
    const res = await apiFetch('/conversations');
    if (!res.ok) {
      console.error('[conversations] List failed →', res.status);
      return null;
    }
    return (await res.json()) as Conversation[];
  } catch (e) {
    console.error('[conversations] List error →', e);
    return null;
  }
}
