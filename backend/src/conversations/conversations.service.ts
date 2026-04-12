import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, dto: CreateConversationDto) {
    // Ensure the current user is included in participants
    if (!dto.participantIds.includes(userId)) {
      dto.participantIds.push(userId);
    }

    const type = dto.type ?? (dto.participantIds.length > 2 ? 'GROUP' : 'PRIVATE');

    // For PRIVATE 1-on-1: check if conversation already exists
    if (type === 'PRIVATE' && dto.participantIds.length === 2) {
      const existing = await this.findExistingDirectConversation(
        dto.participantIds[0],
        dto.participantIds[1],
      );
      if (existing) {
        return this.formatConversation(existing);
      }
    }

    // PRIVATE conversations must have exactly 2 participants
    if (type === 'PRIVATE' && dto.participantIds.length !== 2) {
      throw new BadRequestException('Private conversations must have exactly 2 participants');
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
            role: type === 'CREW'
              ? (id === userId ? 'OWNER' : 'MEMBER')
              : 'MEMBER',
          })),
        },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, username: true, avatar: true } } },
        },
      },
    });

    return this.formatConversation(conversation);
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
          include: { user: { select: { id: true, username: true, avatar: true } } },
        },
      },
    });

    return conversations.map((c) => this.formatConversation(c));
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
      throw new ForbiddenException('You are not a participant of this conversation');
    }

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(before ? { id: { lt: before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
      },
    });

    return messages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      sender: m.sender,
      text: m.text,
      createdAt: m.createdAt,
    }));
  }

  async addParticipants(userId: number, conversationId: number, userIds: number[]) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Cannot add members to private conversations
    if (conversation.type === 'PRIVATE') {
      throw new BadRequestException('Cannot add members to a private conversation');
    }

    // For CREW: only owner can add members
    // For GROUP: any participant can add
    const requester = await this.prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!requester) {
      throw new ForbiddenException('You are not a participant of this conversation');
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
        data: newUserIds.map((id) => ({ userId: id, conversationId, role: 'MEMBER' as const })),
      });
    }

    const updated = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: { user: { select: { id: true, username: true, avatar: true } } },
        },
      },
    });

    return this.formatConversation(updated!);
  }

  async grantWriter(ownerId: number, conversationId: number, targetUserId: number) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation || conversation.type !== 'CREW') {
      throw new BadRequestException('This action is only available for crew conversations');
    }
    if (conversation.ownerId !== ownerId) {
      throw new ForbiddenException('Only the owner can grant write access');
    }

    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId: targetUserId, conversationId } },
    });
    if (!participant) {
      throw new NotFoundException('User is not a participant of this conversation');
    }

    await this.prisma.conversationParticipant.update({
      where: { userId_conversationId: { userId: targetUserId, conversationId } },
      data: { role: 'WRITER' },
    });

    return { message: 'Write access granted' };
  }

  async revokeWriter(ownerId: number, conversationId: number, targetUserId: number) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation || conversation.type !== 'CREW') {
      throw new BadRequestException('This action is only available for crew conversations');
    }
    if (conversation.ownerId !== ownerId) {
      throw new ForbiddenException('Only the owner can revoke write access');
    }

    await this.prisma.conversationParticipant.update({
      where: { userId_conversationId: { userId: targetUserId, conversationId } },
      data: { role: 'MEMBER' },
    });

    return { message: 'Write access revoked' };
  }

  async joinCrew(userId: number, conversationId: number) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (conversation.type !== 'CREW') {
      throw new BadRequestException('You can only self-join crew conversations');
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

  async canWrite(userId: number, conversationId: number): Promise<boolean> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) return false;

    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) return false;

    // PRIVATE and GROUP: all participants can write
    if (conversation.type !== 'CREW') return true;

    // CREW: only OWNER and WRITER can write
    return participant.role === 'OWNER' || participant.role === 'WRITER';
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
          include: { user: { select: { id: true, username: true, avatar: true } } },
        },
        _count: { select: { participants: true } },
      },
    });

    return conversations.find((c) => c._count.participants === 2) ?? null;
  }

  private formatConversation(conversation: {
    id: number;
    type: string;
    name: string | null;
    ownerId: number | null;
    lastMessageText: string | null;
    lastMessageAt: Date | null;
    createdAt: Date;
    participants: Array<{
      role: string;
      user: { id: number; username: string; avatar: string | null };
    }>;
  }) {
    return {
      id: conversation.id,
      type: conversation.type,
      name: conversation.name,
      ownerId: conversation.ownerId,
      lastMessageText: conversation.lastMessageText,
      lastMessageAt: conversation.lastMessageAt,
      createdAt: conversation.createdAt,
      participants: conversation.participants.map((p) => ({
        ...p.user,
        role: p.role,
      })),
    };
  }
}
