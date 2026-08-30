import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from '../chat/chat.gateway';

const AUTHOR = 1;
const OTHER = 2;
const CONVERSATION_ID = 100;
const MESSAGE_ID = 900;

/** An event chat: organizer-controlled, so roles decide who may moderate. */
const EVENT_CHAT = { type: 'GROUP', eventId: 10 };

describe('MessagesService', () => {
  let service: MessagesService;
  let prisma: {
    message: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    conversationParticipant: { findUnique: jest.Mock };
    conversation: { update: jest.Mock };
  };
  let gateway: {
    broadcastMessageEdited: jest.Mock;
    broadcastMessageDeleted: jest.Mock;
    broadcastMessageRestored: jest.Mock;
  };

  /** The stored message, as `load` reads it. */
  const storedMessage = (
    overrides: { senderId?: number; deletedAt?: Date | null } = {},
  ) => ({
    id: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    senderId: overrides.senderId ?? AUTHOR,
    deletedAt: overrides.deletedAt ?? null,
    conversation: EVENT_CHAT,
  });

  beforeEach(async () => {
    prisma = {
      message: {
        findUnique: jest.fn().mockResolvedValue(storedMessage()),
        // By default the edited message is the newest one in the thread.
        findFirst: jest.fn().mockResolvedValue({ id: MESSAGE_ID }),
        update: jest.fn().mockResolvedValue({
          id: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          text: 'rewritten',
          editedAt: new Date('2026-08-28T12:00:00.000Z'),
          deletedAt: new Date('2026-08-28T12:00:00.000Z'),
        }),
      },
      conversationParticipant: {
        findUnique: jest.fn().mockResolvedValue({
          userId: AUTHOR,
          role: 'MEMBER',
          isMuted: false,
          mutedUntil: null,
        }),
      },
      conversation: { update: jest.fn().mockResolvedValue({}) },
    };
    gateway = {
      broadcastMessageEdited: jest.fn(),
      broadcastMessageDeleted: jest.fn(),
      broadcastMessageRestored: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: PrismaService, useValue: prisma },
        { provide: ChatGateway, useValue: gateway },
      ],
    }).compile();

    service = moduleRef.get(MessagesService);
  });

  describe('edit', () => {
    it('rewrites the author’s own message and stamps it edited', async () => {
      await service.edit(AUTHOR, MESSAGE_ID, 'rewritten');

      const [arg] = prisma.message.update.mock.calls[0] as [
        { data: { text: string; editedAt: Date } },
      ];
      expect(arg.data.text).toBe('rewritten');
      expect(arg.data.editedAt).toBeInstanceOf(Date);
    });

    it('tells the room about it', async () => {
      await service.edit(AUTHOR, MESSAGE_ID, 'rewritten');

      expect(gateway.broadcastMessageEdited).toHaveBeenCalledWith(
        CONVERSATION_ID,
        expect.objectContaining({ id: MESSAGE_ID, text: 'rewritten' }),
      );
    });

    it('refuses to let anyone rewrite somebody else’s words', async () => {
      prisma.message.findUnique.mockResolvedValueOnce(
        storedMessage({ senderId: OTHER }),
      );

      await expect(
        service.edit(AUTHOR, MESSAGE_ID, 'rewritten'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('refuses even a moderator — deleting is moderation, editing is not', async () => {
      prisma.message.findUnique.mockResolvedValueOnce(
        storedMessage({ senderId: OTHER }),
      );
      prisma.conversationParticipant.findUnique.mockResolvedValueOnce({
        userId: AUTHOR,
        role: 'ADMIN',
        isMuted: false,
        mutedUntil: null,
      });

      await expect(
        service.edit(AUTHOR, MESSAGE_ID, 'rewritten'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses to edit a message that has been deleted', async () => {
      prisma.message.findUnique.mockResolvedValueOnce(
        storedMessage({ deletedAt: new Date() }),
      );

      await expect(
        service.edit(AUTHOR, MESSAGE_ID, 'rewritten'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('answers 404 for a message that does not exist', async () => {
      prisma.message.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.edit(AUTHOR, MESSAGE_ID, 'rewritten'),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates the thread preview when the edited message is the latest', async () => {
      await service.edit(AUTHOR, MESSAGE_ID, 'rewritten');

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: CONVERSATION_ID },
        data: { lastMessageText: 'rewritten' },
      });
    });

    it('leaves the preview alone when an older message is edited', async () => {
      // Compared by id, not by text: two identical messages would otherwise
      // let an edit to the older one rewrite the newer one's preview.
      prisma.message.findFirst.mockResolvedValueOnce({ id: MESSAGE_ID + 1 });

      await service.edit(AUTHOR, MESSAGE_ID, 'rewritten');

      expect(prisma.conversation.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('lets an author take back their own message', async () => {
      await service.remove(AUTHOR, MESSAGE_ID);

      const [arg] = prisma.message.update.mock.calls[0] as [
        { data: { deletedAt: Date; deletedById: number } },
      ];
      expect(arg.data.deletedById).toBe(AUTHOR);
      expect(arg.data.deletedAt).toBeInstanceOf(Date);
    });

    it('tells the room about it', async () => {
      await service.remove(AUTHOR, MESSAGE_ID);

      expect(gateway.broadcastMessageDeleted).toHaveBeenCalledWith(
        CONVERSATION_ID,
        expect.objectContaining({ id: MESSAGE_ID }),
      );
    });

    it('lets a moderator delete somebody else’s message', async () => {
      prisma.message.findUnique.mockResolvedValueOnce(
        storedMessage({ senderId: OTHER }),
      );
      prisma.conversationParticipant.findUnique.mockResolvedValueOnce({
        userId: AUTHOR,
        role: 'MODERATOR',
        isMuted: false,
        mutedUntil: null,
      });

      await service.remove(AUTHOR, MESSAGE_ID);

      expect(prisma.message.update).toHaveBeenCalled();
    });

    it('refuses a plain participant deleting somebody else’s message', async () => {
      prisma.message.findUnique.mockResolvedValueOnce(
        storedMessage({ senderId: OTHER }),
      );

      await expect(service.remove(AUTHOR, MESSAGE_ID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('refuses somebody who is not in the conversation at all', async () => {
      prisma.conversationParticipant.findUnique.mockResolvedValueOnce(null);

      await expect(service.remove(AUTHOR, MESSAGE_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('refuses a muted moderator — the mute suspends the role', async () => {
      prisma.message.findUnique.mockResolvedValueOnce(
        storedMessage({ senderId: OTHER }),
      );
      prisma.conversationParticipant.findUnique.mockResolvedValueOnce({
        userId: AUTHOR,
        role: 'MODERATOR',
        isMuted: true,
        mutedUntil: null,
      });

      await expect(service.remove(AUTHOR, MESSAGE_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('still lets a muted author delete their own message', async () => {
      // Being silenced is not a reason to be stuck with a message you regret.
      prisma.conversationParticipant.findUnique.mockResolvedValueOnce({
        userId: AUTHOR,
        role: 'MEMBER',
        isMuted: true,
        mutedUntil: null,
      });

      await service.remove(AUTHOR, MESSAGE_ID);

      expect(prisma.message.update).toHaveBeenCalled();
    });

    it('reports success for an already-deleted message', async () => {
      // Two moderators racing on the same message should both see it done.
      const already = new Date('2026-08-28T10:00:00.000Z');
      prisma.message.findUnique.mockResolvedValueOnce(
        storedMessage({ deletedAt: already }),
      );

      await expect(service.remove(AUTHOR, MESSAGE_ID)).resolves.toMatchObject({
        deletedAt: already,
      });
      expect(prisma.message.update).not.toHaveBeenCalled();
      expect(gateway.broadcastMessageDeleted).not.toHaveBeenCalled();
    });

    it('answers 404 for a message that does not exist', async () => {
      prisma.message.findUnique.mockResolvedValueOnce(null);

      await expect(service.remove(AUTHOR, MESSAGE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('blanks the thread preview when the deleted message was the latest', async () => {
      await service.remove(AUTHOR, MESSAGE_ID);

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: CONVERSATION_ID },
        data: { lastMessageText: '' },
      });
    });
  });

  describe('restore', () => {
    const DELETED_AT = new Date('2026-08-28T12:00:00.000Z');

    /** A deleted row, as `restore` reads it. */
    const deletedBy = (userId: number | null) => {
      prisma.message.findUnique.mockResolvedValueOnce({
        id: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        deletedAt: DELETED_AT,
        deletedById: userId,
      });
    };

    it('clears the deletion and hands the whole message back', async () => {
      deletedBy(AUTHOR);

      await service.restore(AUTHOR, MESSAGE_ID);

      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { deletedAt: null, deletedById: null },
        }),
      );
    });

    it('broadcasts the message in full, not just its id', async () => {
      // Everyone dropped it when it went, so an id alone leaves them nothing
      // to put back.
      deletedBy(AUTHOR);

      await service.restore(AUTHOR, MESSAGE_ID);

      expect(gateway.broadcastMessageRestored).toHaveBeenCalledWith(
        CONVERSATION_ID,
        expect.objectContaining({ id: MESSAGE_ID, text: 'rewritten' }),
      );
    });

    it('refuses anyone but the person who deleted it', async () => {
      // An author must not be able to quietly reinstate what a moderator took
      // down.
      deletedBy(OTHER);

      await expect(service.restore(AUTHOR, MESSAGE_ID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('refuses a message that was never deleted', async () => {
      prisma.message.findUnique.mockResolvedValueOnce({
        id: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        deletedAt: null,
        deletedById: null,
      });

      await expect(service.restore(AUTHOR, MESSAGE_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('answers 404 for a message that does not exist', async () => {
      prisma.message.findUnique.mockResolvedValueOnce(null);

      await expect(service.restore(AUTHOR, MESSAGE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('puts the text back in the thread preview', async () => {
      deletedBy(AUTHOR);

      await service.restore(AUTHOR, MESSAGE_ID);

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: CONVERSATION_ID },
        data: { lastMessageText: 'rewritten' },
      });
    });
  });
});
