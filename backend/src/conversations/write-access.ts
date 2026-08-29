/**
 * Who may post in a conversation, who may moderate it, and who may change
 * other people's roles.
 *
 * Kept as pure functions because the rules are asked in several places — the
 * gateway enforces posting before saving a message, the REST payload reports
 * them so the app can disable its input and hide its controls, and the service
 * checks them on every management write. Two copies of the posting rule
 * drifted apart once already.
 */

/** The parts of a conversation the rules depend on. */
export interface WritableConversation {
  type: string;
  /** Set when the thread belongs to an event. */
  eventId: number | null;
}

/** The mute state of one participant. */
export interface MutableParticipant {
  role: string;
  isMuted: boolean;
  /** When the mute lifts itself. NULL while muted means it never does. */
  mutedUntil: Date | null;
}

/** The roles an organizer (or co-organizer) can actually hand out. */
export const ASSIGNABLE_ROLES = [
  'MEMBER',
  'WRITER',
  'MODERATOR',
  'ADMIN',
] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/**
 * Seniority, used to decide who may act on whom.
 *
 * OWNER sits above everything and is deliberately unreachable: they are the
 * event's host, and no co-organizer may remove, mute or demote them.
 */
const RANK: Record<string, number> = {
  MEMBER: 0,
  WRITER: 1,
  MODERATOR: 2,
  ADMIN: 3,
  OWNER: 4,
};

const rankOf = (role: string): number => RANK[role] ?? -1;

/**
 * True when only privileged participants may post.
 *
 * Keyed off the event link rather than the type: an event chat is stored as a
 * GROUP, so reading `type` alone would leave it wide open.
 */
export function isRestricted(conversation: WritableConversation): boolean {
  return conversation.type === 'CREW' || conversation.eventId !== null;
}

/**
 * True when `role` may post in `conversation`, ignoring any mute.
 *
 * Open threads (PRIVATE, plain GROUP) let every participant write. Crews and
 * event chats are organizer-controlled: the owner, their co-organizers, their
 * moderators and anyone promoted to WRITER. Everybody else reads.
 *
 * This deliberately says nothing about blocks — that silences a 1-on-1 at send
 * time and is the caller's business, not a property of the participant's role.
 */
export function roleCanWrite(
  conversation: WritableConversation,
  role: string,
): boolean {
  if (!isRestricted(conversation)) return true;
  return rankOf(role) >= RANK.WRITER;
}

/**
 * True when the participant is silenced right now.
 *
 * A mute with no end date stays until it is lifted; a timed one expires on its
 * own, so nothing has to sweep the table to clear it.
 */
export function isMutedNow(
  participant: Pick<MutableParticipant, 'isMuted' | 'mutedUntil'>,
  now: Date = new Date(),
): boolean {
  if (!participant.isMuted) return false;
  if (participant.mutedUntil === null) return true;
  return participant.mutedUntil.getTime() > now.getTime();
}

/**
 * The role that counts right now.
 *
 * A mute suspends the role rather than replacing it: while it lasts the person
 * is a plain reader — no posting, no moderating, no handing out roles — and
 * what they were comes back on its own when the mute lifts. The stored role is
 * left alone, so lifting a mute needs no bookkeeping to restore anything.
 */
export function effectiveRole(
  participant: MutableParticipant,
  now: Date = new Date(),
): string {
  return isMutedNow(participant, now) ? 'MEMBER' : participant.role;
}

/** Whether this participant may post at this moment. */
export function canWriteNow(
  conversation: WritableConversation,
  participant: MutableParticipant,
  now: Date = new Date(),
): boolean {
  return roleCanWrite(conversation, effectiveRole(participant, now));
}

/** Whether this participant may delete other people's messages right now. */
export function canModerateNow(
  conversation: WritableConversation,
  participant: MutableParticipant,
  now: Date = new Date(),
): boolean {
  return roleCanModerate(conversation, effectiveRole(participant, now));
}

/** Whether this participant may set other people's roles right now. */
export function canManageNow(
  conversation: WritableConversation,
  participant: MutableParticipant,
  now: Date = new Date(),
): boolean {
  return roleCanManage(conversation, effectiveRole(participant, now));
}

/**
 * True when `role` may delete other people's messages.
 *
 * Only meaningful in a restricted thread; an open group has no moderators.
 */
export function roleCanModerate(
  conversation: WritableConversation,
  role: string,
): boolean {
  if (!isRestricted(conversation)) return false;
  return rankOf(role) >= RANK.MODERATOR;
}

/**
 * True when `role` may change other people's roles.
 *
 * Stricter than moderation: a moderator polices what is said, but only the
 * owner and their co-organizers decide who may say it.
 */
export function roleCanManage(
  conversation: WritableConversation,
  role: string,
): boolean {
  if (!isRestricted(conversation)) return false;
  return rankOf(role) >= RANK.ADMIN;
}

/** Why an action against another participant was refused, or null if allowed. */
export type MemberActionRefusal = 'not-allowed' | 'owner-untouchable';

/**
 * Whether `actorRole` may mute or remove somebody holding `targetRole`.
 *
 * The owner is untouchable. Below that, an ADMIN may act on anyone — including
 * another co-organizer, which is what "everyone but the organizer" means — but
 * a MODERATOR may only act on people below them, so they cannot turn on the
 * co-organizers who appointed them.
 *
 * `actorRole` is the caller's *effective* role, so a muted moderator cannot
 * act. `targetRole` is the target's stored one: being temporarily silenced
 * must not strip somebody of the protection their standing gives them.
 */
export function refuseMemberAction(
  conversation: WritableConversation,
  actorRole: string,
  targetRole: string,
): MemberActionRefusal | null {
  if (!roleCanModerate(conversation, actorRole)) return 'not-allowed';
  if (targetRole === 'OWNER') return 'owner-untouchable';
  if (rankOf(actorRole) >= RANK.ADMIN) return null;
  return rankOf(actorRole) > rankOf(targetRole) ? null : 'not-allowed';
}

/** Why a role change was refused, or null when it is allowed. */
export type RoleChangeRefusal =
  | 'not-allowed'
  | 'owner-untouchable'
  | 'owner-unassignable';

/**
 * Whether `actorRole` may set `nextRole` on somebody currently holding
 * `currentTargetRole`.
 *
 * The owner is immovable in both directions: nobody can change their role, and
 * nobody can be promoted into it. Otherwise a co-organizer could demote the
 * host of the event, or mint a second one.
 */
export function refuseRoleChange(
  conversation: WritableConversation,
  actorRole: string,
  currentTargetRole: string,
  nextRole: string,
): RoleChangeRefusal | null {
  if (!roleCanManage(conversation, actorRole)) return 'not-allowed';
  if (currentTargetRole === 'OWNER') return 'owner-untouchable';
  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(nextRole)) {
    return 'owner-unassignable';
  }
  return null;
}

/**
 * Whether `actor` may delete `message`.
 *
 * People can always take back their own words, muted or not — being silenced
 * is not a reason to be stuck with a message you regret. Deleting somebody
 * else's is a moderation act, so it goes through the caller's effective role
 * and a mute suspends it.
 */
export function canDeleteMessage(
  conversation: WritableConversation,
  actor: { userId: number; role: string },
  message: { senderId: number },
): boolean {
  if (actor.userId === message.senderId) return true;
  return roleCanModerate(conversation, actor.role);
}
