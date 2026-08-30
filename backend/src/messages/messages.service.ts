import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from '../chat/chat.gateway';
import {
  canDeleteMessage,
  canEditMessage,
  effectiveRole,
} from '../conversations/write-access';

/**
 * Editing and removing messages after the fact.
 *
 * Both write through REST and then announce themselves over the socket, so the
 * change lands for people already looking at the thread without them having to
 * reload. The route is the API; the broadcast is only how the news travels.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ChatGateway,
  ) {}

  /**
   * Rewrites a message. Authors only — no role grants this.
   *
   * A moderator can take a message down, which everyone sees happen, but
   * putting different words in somebody else's mouth is not moderation and
   * nothing in the thread would show it had happened.
   */
  async edit(actorId: number, messageId: number, text: string) {
    const message = await this.load(messageId);

    if (!canEditMessage(actorId, message)) {
      // Deliberately the same answer whether it is somebody else's message or
      // an already-deleted one: neither is editable, and distinguishing them
      // would confirm who wrote what in a thread the caller may not be in.
      throw new ForbiddenException('You can only edit your own messages');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { text, editedAt: new Date() },
      select: {
        id: true,
        conversationId: true,
        text: true,
        editedAt: true,
        createdAt: true,
      },
    });

    // The list preview would otherwise keep showing the words that were
    // replaced, but only when this was the most recent message.
    await this.refreshPreview(updated.conversationId, messageId, text);

    this.gateway.broadcastMessageEdited(updated.conversationId, {
      id: updated.id,
      text: updated.text,
      editedAt: updated.editedAt,
    });

    return updated;
  }

  /**
   * Removes a message. Authors can always take back their own words; deleting
   * somebody else's is a moderation act, which the roles decide.
   *
   * Soft: the row stays so the audit trail does — and so the person who
   * deleted it has a few seconds to undo, which a hard delete could not offer.
   * It stops being served the moment it goes.
   */
  async remove(actorId: number, messageId: number) {
    const message = await this.load(messageId);
    const actor = await this.prisma.conversationParticipant.findUnique({
      where: {
        userId_conversationId: {
          userId: actorId,
          conversationId: message.conversationId,
        },
      },
    });
    if (!actor) {
      throw new ForbiddenException(
        'You are not a participant of this conversation',
      );
    }

    if (
      !canDeleteMessage(
        message.conversation,
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

    await this.refreshPreview(deleted.conversationId, messageId, '');

    this.gateway.broadcastMessageDeleted(deleted.conversationId, {
      id: deleted.id,
      deletedAt: deleted.deletedAt,
    });

    return deleted;
  }

  /**
   * Puts a deleted message back.
   *
   * Only whoever deleted it may undo it — an author cannot quietly reinstate
   * something a moderator took down, and a moderator cannot resurrect what an
   * author chose to retract.
   */
  async restore(actorId: number, messageId: number) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversationId: true,
        deletedAt: true,
        deletedById: true,
      },
    });
    if (!message) throw new NotFoundException('Message not found');

    if (!message.deletedAt) {
      throw new BadRequestException('That message is not deleted');
    }
    if (message.deletedById !== actorId) {
      throw new ForbiddenException('Only whoever deleted it can restore it');
    }

    const restored = await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: null, deletedById: null },
      select: {
        id: true,
        conversationId: true,
        text: true,
        editedAt: true,
        createdAt: true,
        sender: { select: { id: true, username: true, avatar: true } },
      },
    });

    await this.refreshPreview(
      restored.conversationId,
      messageId,
      restored.text,
    );

    // The whole message travels, not just its id: everyone else dropped it
    // from their thread when it went, so they need it back in full.
    this.gateway.broadcastMessageRestored(restored.conversationId, restored);

    return restored;
  }

  /**
   * The message, its conversation, and confirmation that the caller belongs
   * there.
   *
   * A message the caller cannot see reads as missing rather than forbidden —
   * answering 403 would confirm the id exists.
   */
  private async load(messageId: number) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        deletedAt: true,
        conversation: { select: { type: true, eventId: true } },
      },
    });
    if (!message) throw new NotFoundException('Message not found');
    return message;
  }

  /**
   * Keeps the conversation list in step when the message that changed is the
   * one being previewed there.
   *
   * Compared by id rather than by text: two identical messages would otherwise
   * make an edit to the older one rewrite the preview of the newer.
   */
  private async refreshPreview(
    conversationId: number,
    messageId: number,
    text: string,
  ): Promise<void> {
    const latest = await this.prisma.message.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (latest?.id !== messageId) return;

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageText: text },
    });
  }
}
