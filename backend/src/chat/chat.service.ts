import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Push bodies get truncated so the notification stays readable. */
const PREVIEW_MAX_LENGTH = 120;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async isParticipant(userId: number, conversationId: number): Promise<boolean> {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    return !!participant;
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

  async saveMessage(senderId: number, conversationId: number, text: string) {
    const message = await this.prisma.message.create({
      data: { senderId, conversationId, text },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
      },
    });

    // Update conversation's last message preview
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageText: text,
        lastMessageAt: message.createdAt,
      },
    });

    return {
      id: message.id,
      conversationId: message.conversationId,
      sender: message.sender,
      text: message.text,
      createdAt: message.createdAt,
    };
  }

  /**
   * Pushes a new message to every participant except the sender and anyone
   * with the thread currently open (they already saw it live over the socket).
   */
  async notifyNewMessage(
    conversationId: number,
    senderId: number,
    senderUsername: string,
    text: string,
    activeUserIds: number[] = [],
  ): Promise<void> {
    const skip = new Set([senderId, ...activeUserIds]);

    const [conversation, participants] = await Promise.all([
      this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { type: true, name: true },
      }),
      this.prisma.conversationParticipant.findMany({
        where: { conversationId },
        select: { userId: true },
      }),
    ]);
    if (!conversation) return;

    const recipients = participants
      .map((p) => p.userId)
      .filter((id) => !skip.has(id));
    if (recipients.length === 0) return;

    const preview =
      text.length > PREVIEW_MAX_LENGTH
        ? `${text.slice(0, PREVIEW_MAX_LENGTH - 1)}…`
        : text;

    // In a 1-on-1 the sender's name is the thread's name; in a group the
    // conversation name is the useful header and the sender goes in the body.
    const isDirect = conversation.type === 'PRIVATE';

    await this.notifications.sendToUsers(recipients, {
      title: isDirect ? senderUsername : (conversation.name ?? 'Group chat'),
      body: isDirect ? preview : `${senderUsername}: ${preview}`,
      data: { type: 'chat', conversationId },
    });
  }
}
