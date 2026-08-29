import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import {
  canDeleteMessage,
  canManageNow,
  canModerateNow,
  canWriteNow,
  effectiveRole,
  isMutedNow,
  isRestricted,
  refuseMemberAction,
  refuseRoleChange,
  roleCanWrite,
  type AssignableRole,
} from './write-access';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
  ) {}

  async create(userId: number, dto: CreateConversationDto) {
    // Ensure the current user is included in participants
    if (!dto.participantIds.includes(userId)) {
      dto.participantIds.push(userId);
    }

    const hidden = await this.moderation.hiddenUserIds(userId);
    if (dto.participantIds.some((id) => hidden.includes(id))) {
      throw new ForbiddenException(
        'You cannot start a conversation with this user',
      );
    }

    const type =
      dto.type ?? (dto.participantIds.length > 2 ? 'GROUP' : 'PRIVATE');

    // For PRIVATE 1-on-1: check if conversation already exists
    if (type === 'PRIVATE' && dto.participantIds.length === 2) {
      const existing = await this.findExistingDirectConversation(
        dto.participantIds[0],
        dto.participantIds[1],
      );
      if (existing) {
        return this.formatConversation(existing, userId);
      }
    }

    // PRIVATE conversations must have exactly 2 participants
    if (type === 'PRIVATE' && dto.participantIds.length !== 2) {
      throw new BadRequestException(
        'Private conversations must have exactly 2 participants',
      );
    }

    // Validate that all participant users exist
    const users = await this.prisma.user.findMany({
      where: { id: { in: dto.participantIds } },
      select: { id: true },
    });
    if (users.length !== dto.participantIds.length) {
      throw new BadRequestException('One or more participant IDs are invalid');
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        type,
        name: dto.name ?? null,
        ownerId: type === 'CREW' ? userId : null,
        participants: {
          create: dto.participantIds.map((id) => ({
            userId: id,
            role:
              type === 'CREW' ? (id === userId ? 'OWNER' : 'MEMBER') : 'MEMBER',
          })),
        },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, username: true, avatar: true } },
          },
        },
      },
    });

    return this.formatConversation(conversation, userId);
  }

  async findAll(userId: number) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        participants: { some: { userId } },
      },
      orderBy: [
        { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
      include: {
        participants: {
          include: {
            user: { select: { id: true, username: true, avatar: true } },
          },
        },
      },
    });

    const hidden = await this.moderation.hiddenUserIds(userId);

    return conversations
      .filter((c) => {
        // A private thread with a blocked user disappears entirely. Group and
        // crew threads stay — other members are still there — and the blocked
        // member's messages are filtered out by getMessages instead.
        if (c.type !== 'PRIVATE') return true;
        return !c.participants.some((p) => hidden.includes(p.userId));
      })
      .map((c) => this.formatConversation(c, userId));
  }

  async getMessages(
    userId: number,
    conversationId: number,
    before?: number,
    limit: number = 20,
  ) {
    // Verify user is a participant
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) {
      throw new ForbiddenException(
        'You are not a participant of this conversation',
      );
    }

    const hidden = await this.moderation.hiddenUserIds(userId);

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        senderId: { notIn: hidden },
        ...(before ? { id: { lt: before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
      },
    });

    // A deleted message keeps its place as a tombstone: silently dropping it
    // would reshuffle the thread under anyone reading it.
    return messages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      sender: m.sender,
      text: m.deletedAt ? '' : m.text,
      deletedAt: m.deletedAt,
      createdAt: m.createdAt,
    }));
  }

  async addParticipants(
    userId: number,
    conversationId: number,
    userIds: number[],
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Cannot add members to private conversations
    if (conversation.type === 'PRIVATE') {
      throw new BadRequestException(
        'Cannot add members to a private conversation',
      );
    }

    // For CREW: only owner can add members
    // For GROUP: any participant can add
    const requester = await this.prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!requester) {
      throw new ForbiddenException(
        'You are not a participant of this conversation',
      );
    }
    if (conversation.type === 'CREW' && requester.role !== 'OWNER') {
      throw new ForbiddenException('Only the owner can add members to a crew');
    }

    // Validate that all new users exist
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    });
    if (users.length !== userIds.length) {
      throw new BadRequestException('One or more user IDs are invalid');
    }

    // Filter out users who are already participants
    const existing = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, userId: { in: userIds } },
      select: { userId: true },
    });
    const existingIds = new Set(existing.map((p) => p.userId));
    const newUserIds = userIds.filter((id) => !existingIds.has(id));

    if (newUserIds.length > 0) {
      await this.prisma.conversationParticipant.createMany({
        data: newUserIds.map((id) => ({
          userId: id,
          conversationId,
          role: 'MEMBER' as const,
        })),
      });
    }

    const updated = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: { select: { id: true, username: true, avatar: true } },
          },
        },
      },
    });

    return this.formatConversation(updated!, userId);
  }

  /**
   * Sets somebody's role in an organizer-controlled thread.
   *
   * Replaces the old grant/revoke pair: with three assignable roles, two
   * boolean endpoints could not express the middle one, and keeping them
   * alongside this would be two ways to write the same column.
   *
   * Idempotent. The owner is immovable in both directions — their role cannot
   * be changed, and nobody can be promoted into it — so a co-organizer can
   * neither demote the host nor mint a second one.
   */
  async setParticipantRole(
    actorId: number,
    conversationId: number,
    targetUserId: number,
    nextRole: string,
  ) {
    const { conversation, actor } = await this.assertCanManage(
      actorId,
      conversationId,
    );
    const target = await this.assertParticipant(conversationId, targetUserId);

    const refusal = refuseRoleChange(
      conversation,
      effectiveRole(actor),
      target.role,
      nextRole,
    );
    if (refusal === 'not-allowed') {
      throw new ForbiddenException('You cannot manage this thread');
    }
    if (refusal === 'owner-untouchable') {
      throw new BadRequestException("The organizer's role cannot be changed");
    }
    if (refusal === 'owner-unassignable') {
      throw new BadRequestException('That role cannot be assigned');
    }

    await this.prisma.conversationParticipant.update({
      where: {
        userId_conversationId: { userId: targetUserId, conversationId },
      },
      data: { role: nextRole as AssignableRole },
    });

    return { userId: targetUserId, role: nextRole };
  }

  /**
   * Removes somebody from an organizer-controlled thread.
   *
   * Owner-only, unlike role changes: a co-organizer manages what people may
   * say, not whether they are here at all.
   *
   * Only touches the chat — they keep their place at the event itself. Kicking
   * someone out of a conversation and un-inviting them from the event are
   * different decisions, and the organizer already has `DELETE /events/:id`
   * for the second one.
   */
  async removeParticipant(
    actorId: number,
    conversationId: number,
    targetUserId: number,
  ) {
    await this.assertCanActOn(actorId, conversationId, targetUserId);

    await this.prisma.conversationParticipant.delete({
      where: {
        userId_conversationId: { userId: targetUserId, conversationId },
      },
    });

    return { message: 'Removed from the conversation' };
  }

  /**
   * Silences a participant without touching their role.
   *
   * `minutes` is how long it lasts; omit it for a mute with no end date. A
   * timed mute expires on its own, so nothing has to sweep the table.
   */
  async muteParticipant(
    actorId: number,
    conversationId: number,
    targetUserId: number,
    minutes?: number,
  ) {
    await this.assertCanActOn(actorId, conversationId, targetUserId);

    const mutedUntil =
      minutes === undefined ? null : new Date(Date.now() + minutes * 60_000);

    const updated = await this.prisma.conversationParticipant.update({
      where: {
        userId_conversationId: { userId: targetUserId, conversationId },
      },
      data: { isMuted: true, mutedUntil },
      select: { userId: true, isMuted: true, mutedUntil: true },
    });

    return updated;
  }

  /** Lifts a mute, timed or not. */
  async unmuteParticipant(
    actorId: number,
    conversationId: number,
    targetUserId: number,
  ) {
    await this.assertCanActOn(actorId, conversationId, targetUserId);

    const updated = await this.prisma.conversationParticipant.update({
      where: {
        userId_conversationId: { userId: targetUserId, conversationId },
      },
      data: { isMuted: false, mutedUntil: null },
      select: { userId: true, isMuted: true, mutedUntil: true },
    });

    return updated;
  }

  /**
   * Removes a message. Authors can always take back their own words; deleting
   * somebody else's is a moderation act.
   *
   * Soft: the row stays so the audit trail does, and the reader is left with a
   * tombstone rather than a silently reshuffled conversation.
   */
  async deleteMessage(
    actorId: number,
    conversationId: number,
    messageId: number,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const actor = await this.assertParticipant(conversationId, actorId);
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        deletedAt: true,
      },
    });
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundException('Message not found');
    }

    if (
      !canDeleteMessage(
        conversation,
        { userId: actorId, role: effectiveRole(actor) },
        message,
      )
    ) {
      throw new ForbiddenException('You cannot delete this message');
    }

    // Already gone: report success rather than 404, so two moderators racing
    // on the same message both see it done.
    if (message.deletedAt) {
      return { id: message.id, deletedAt: message.deletedAt };
    }

    const deleted = await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), deletedById: actorId },
      select: { id: true, conversationId: true, deletedAt: true },
    });

    return deleted;
  }

  /**
   * The conversation plus both participations, once the caller is confirmed
   * able to act on the target — mute or remove.
   */
  private async assertCanActOn(
    actorId: number,
    conversationId: number,
    targetUserId: number,
  ) {
    const conversation = await this.assertRestricted(conversationId);
    const actor = await this.assertParticipant(conversationId, actorId);
    const target = await this.assertParticipant(conversationId, targetUserId);

    const refusal = refuseMemberAction(
      conversation,
      effectiveRole(actor),
      target.role,
    );
    if (refusal === 'owner-untouchable') {
      throw new BadRequestException('The organizer cannot be muted or removed');
    }
    if (refusal) {
      throw new ForbiddenException('You cannot do this to this person');
    }
    return { conversation, actor, target };
  }

  /**
   * The conversation plus the caller's own participation, once both are
   * confirmed: an organizer-controlled thread, and a caller allowed to manage
   * it. Owners and co-organizers qualify.
   */
  private async assertCanManage(actorId: number, conversationId: number) {
    const conversation = await this.assertRestricted(conversationId);
    const actor = await this.prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId: actorId, conversationId } },
    });
    if (!actor || !canManageNow(conversation, actor)) {
      throw new ForbiddenException('You cannot manage this thread');
    }
    return { conversation, actor };
  }

  private async assertRestricted(conversationId: number) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (!isRestricted(conversation)) {
      throw new BadRequestException(
        'This action is only available for crew and event conversations',
      );
    }
    return conversation;
  }

  private async assertParticipant(conversationId: number, userId: number) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) {
      throw new NotFoundException(
        'User is not a participant of this conversation',
      );
    }
    return participant;
  }

  // ── Event group chats ─────────────────────────────────────────────────

  /**
   * The group chat for an event, created on first use.
   *
   * Called both when the event is created and when somebody joins it, so
   * events that predate this feature — the seeded ones included — grow a chat
   * the moment anyone signs up. `eventId` is unique, so a race between those
   * two paths ends with one conversation, not two.
   */
  async ensureEventConversation(eventId: number): Promise<number | null> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, organizerId: true },
    });
    if (!event) return null;

    const existing = await this.prisma.conversation.findUnique({
      where: { eventId },
      select: { id: true },
    });
    if (existing) return existing.id;

    // Anyone already signed up joins the thread as it opens. Without this, a
    // chat created late — an event from before this feature, or one whose
    // creation-time attempt failed — would only ever contain the people who
    // joined after it appeared.
    const attendees = await this.prisma.eventParticipation.findMany({
      where: { eventId },
      select: { userId: true },
    });
    const members = attendees
      .map((a) => a.userId)
      .filter((userId) => userId !== event.organizerId)
      .map((userId) => ({ userId, role: 'MEMBER' as const }));

    try {
      const conversation = await this.prisma.conversation.create({
        data: {
          type: 'GROUP',
          name: event.title,
          eventId,
          // The organizer owns the thread: they are the one who can speak by
          // default, hand out write access and remove people.
          ownerId: event.organizerId,
          participants: {
            create: [{ userId: event.organizerId, role: 'OWNER' }, ...members],
          },
        },
        select: { id: true },
      });
      return conversation.id;
    } catch {
      // Lost the race against a concurrent join — the winner's row is the one
      // we want either way.
      const raced = await this.prisma.conversation.findUnique({
        where: { eventId },
        select: { id: true },
      });
      return raced?.id ?? null;
    }
  }

  /**
   * Adds someone to an event's chat as a reader.
   *
   * MEMBER, not WRITER: the thread is the organizer's megaphone until they
   * decide otherwise. Idempotent, and it never demotes an existing role — a
   * writer who leaves and rejoins the event keeps what they were given.
   */
  async addEventParticipant(eventId: number, userId: number): Promise<void> {
    const conversationId = await this.ensureEventConversation(eventId);
    if (conversationId === null) return;

    const existing = await this.prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
      select: { userId: true },
    });
    if (existing) return;

    await this.prisma.conversationParticipant.create({
      data: { userId, conversationId, role: 'MEMBER' },
    });
  }

  /**
   * Drops someone from an event's chat when they cancel their participation.
   *
   * The organizer is left alone: they own the thread, and cancelling their own
   * attendance should not orphan the conversation they run.
   */
  async removeEventParticipant(eventId: number, userId: number): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { eventId },
      select: { id: true, ownerId: true },
    });
    if (!conversation || conversation.ownerId === userId) return;

    await this.prisma.conversationParticipant.deleteMany({
      where: { conversationId: conversation.id, userId },
    });
  }

  async joinCrew(userId: number, conversationId: number) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (conversation.type !== 'CREW') {
      throw new BadRequestException(
        'You can only self-join crew conversations',
      );
    }

    // Check if already a participant
    const existing = await this.prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (existing) {
      return { message: 'Already a member' };
    }

    await this.prisma.conversationParticipant.create({
      data: { userId, conversationId, role: 'MEMBER' },
    });

    return { message: 'Joined crew successfully' };
  }

  private async findExistingDirectConversation(userA: number, userB: number) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        type: 'PRIVATE',
        AND: [
          { participants: { some: { userId: userA } } },
          { participants: { some: { userId: userB } } },
        ],
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, username: true, avatar: true } },
          },
        },
        _count: { select: { participants: true } },
      },
    });

    return conversations.find((c) => c._count.participants === 2) ?? null;
  }

  /**
   * The wire shape of a conversation.
   *
   * `viewerId` is what turns the shared write rule into something the app can
   * act on directly: `canWrite` decides whether the composer is usable, and
   * `isOwner` whether the member-management sheet is offered. Working that out
   * on the client would mean shipping the same rule twice.
   */
  private formatConversation(
    conversation: {
      id: number;
      type: string;
      name: string | null;
      ownerId: number | null;
      eventId: number | null;
      lastMessageText: string | null;
      lastMessageAt: Date | null;
      createdAt: Date;
      participants: Array<{
        role: string;
        isMuted: boolean;
        mutedUntil: Date | null;
        user: { id: number; username: string; avatar: string | null };
      }>;
    },
    viewerId: number,
  ) {
    const mine = conversation.participants.find((p) => p.user.id === viewerId);

    return {
      id: conversation.id,
      type: conversation.type,
      name: conversation.name,
      ownerId: conversation.ownerId,
      eventId: conversation.eventId,
      lastMessageText: conversation.lastMessageText,
      lastMessageAt: conversation.lastMessageAt,
      createdAt: conversation.createdAt,
      /** The viewer's own role, so the app never has to hunt for itself. */
      myRole: mine?.role ?? null,
      /** True when only privileged participants may post. */
      isRestricted: isRestricted(conversation),
      /** What the viewer's role allows, before any mute. */
      roleAllowsWrite: mine ? roleCanWrite(conversation, mine.role) : false,
      /** Whether the viewer may post right now — role and mute together. */
      canWrite: mine ? canWriteNow(conversation, mine) : false,
      /** Whether the viewer may delete other people's messages right now. */
      canModerate: mine ? canModerateNow(conversation, mine) : false,
      /** Whether the viewer may set other people's roles right now. */
      canManage: mine ? canManageNow(conversation, mine) : false,
      isOwner: conversation.ownerId === viewerId,
      /** The viewer's own mute, so the composer can explain itself. */
      isMuted: mine ? isMutedNow(mine) : false,
      mutedUntil: mine?.mutedUntil ?? null,
      participants: conversation.participants.map((p) => ({
        ...p.user,
        role: p.role,
        isMuted: isMutedNow(p),
        mutedUntil: p.mutedUntil,
      })),
    };
  }
}
