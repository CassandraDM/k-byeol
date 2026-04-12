import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

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
}
