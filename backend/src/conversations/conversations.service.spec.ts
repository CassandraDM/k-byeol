import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';

const ORGANIZER = 1;
const PARTICIPANT = 2;
const EVENT_ID = 10;
const CONVERSATION_ID = 100;

/** The event chat as stored: a GROUP carrying an eventId, owned by its host. */
const EVENT_CHAT = {
  id: CONVERSATION_ID,
  type: 'GROUP',
  eventId: EVENT_ID,
  ownerId: ORGANIZER,
};

describe('ConversationsService — event group chats', () => {
  let service: ConversationsService;
  let prisma: {
    event: { findUnique: jest.Mock };
    conversation: { findUnique: jest.Mock; create: jest.Mock };
    eventParticipation: { findMany: jest.Mock };
    conversationParticipant: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      event: {
        findUnique: jest.fn().mockResolvedValue({
          id: EVENT_ID,
          title: 'Random play dance',
          organizerId: ORGANIZER,
        }),
      },
      conversation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: CONVERSATION_ID }),
      },
      // No one signed up yet unless a test says otherwise.
      eventParticipation: { findMany: jest.fn().mockResolvedValue([]) },
      conversationParticipant: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ModerationService,
          useValue: { hiddenUserIds: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = moduleRef.get(ConversationsService);
  });

  describe('ensureEventConversation', () => {
    it('creates the thread with the organizer as its owner', async () => {
      await expect(service.ensureEventConversation(EVENT_ID)).resolves.toBe(
        CONVERSATION_ID,
      );

      // Reading the recorded argument with a declared shape, rather than
      // nesting matchers — an assertion on `undefined` would pass silently.
      const [arg] = prisma.conversation.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(arg.data).toMatchObject({
        type: 'GROUP',
        eventId: EVENT_ID,
        ownerId: ORGANIZER,
        participants: { create: [{ userId: ORGANIZER, role: 'OWNER' }] },
      });
    });

    it('brings everyone already signed up into the new thread', async () => {
      // An event that predates the feature: its chat opens late, and must not
      // contain only the people who join after it appears.
      prisma.eventParticipation.findMany.mockResolvedValueOnce([
        { userId: PARTICIPANT },
        { userId: 3 },
      ]);

      await service.ensureEventConversation(EVENT_ID);

      const [arg] = prisma.conversation.create.mock.calls[0] as [
        { data: { participants: { create: unknown[] } } },
      ];
      expect(arg.data.participants.create).toEqual([
        { userId: ORGANIZER, role: 'OWNER' },
        { userId: PARTICIPANT, role: 'MEMBER' },
        { userId: 3, role: 'MEMBER' },
      ]);
    });

    it('does not list an attending organiser twice', async () => {
      // The organiser can also be signed up; they own the thread either way,
      // and a duplicate row would violate the composite key.
      prisma.eventParticipation.findMany.mockResolvedValueOnce([
        { userId: ORGANIZER },
        { userId: PARTICIPANT },
      ]);

      await service.ensureEventConversation(EVENT_ID);

      const [arg] = prisma.conversation.create.mock.calls[0] as [
        { data: { participants: { create: { userId: number }[] } } },
      ];
      const ids = arg.data.participants.create.map((p) => p.userId);
      expect(ids).toEqual([ORGANIZER, PARTICIPANT]);
    });

    it('reuses the existing thread instead of opening a second one', async () => {
      prisma.conversation.findUnique.mockResolvedValueOnce({
        id: CONVERSATION_ID,
      });

      await expect(service.ensureEventConversation(EVENT_ID)).resolves.toBe(
        CONVERSATION_ID,
      );
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it('recovers the winner when a concurrent join wins the race', async () => {
      // Two people joining at once: the unique eventId rejects the loser.
      prisma.conversation.create.mockRejectedValueOnce(
        new Error('unique constraint'),
      );
      prisma.conversation.findUnique
        .mockResolvedValueOnce(null) // nothing there when we looked
        .mockResolvedValueOnce({ id: CONVERSATION_ID }); // the winner's row

      await expect(service.ensureEventConversation(EVENT_ID)).resolves.toBe(
        CONVERSATION_ID,
      );
    });

    it('does nothing for an event that does not exist', async () => {
      prisma.event.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.ensureEventConversation(EVENT_ID),
      ).resolves.toBeNull();
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });
  });

  describe('addEventParticipant', () => {
    it('adds a joiner as a reader, not a writer', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: CONVERSATION_ID });

      await service.addEventParticipant(EVENT_ID, PARTICIPANT);

      expect(prisma.conversationParticipant.create).toHaveBeenCalledWith({
        data: {
          userId: PARTICIPANT,
          conversationId: CONVERSATION_ID,
          role: 'MEMBER',
        },
      });
    });

    it('does not demote somebody who is already a writer', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: CONVERSATION_ID });
      prisma.conversationParticipant.findUnique.mockResolvedValueOnce({
        userId: PARTICIPANT,
      });

      await service.addEventParticipant(EVENT_ID, PARTICIPANT);

      expect(prisma.conversationParticipant.create).not.toHaveBeenCalled();
    });
  });

  describe('removeEventParticipant', () => {
    it('drops the participant from the thread', async () => {
      prisma.conversation.findUnique.mockResolvedValueOnce({
        id: CONVERSATION_ID,
        ownerId: ORGANIZER,
      });

      await service.removeEventParticipant(EVENT_ID, PARTICIPANT);

      expect(prisma.conversationParticipant.deleteMany).toHaveBeenCalledWith({
        where: { conversationId: CONVERSATION_ID, userId: PARTICIPANT },
      });
    });

    it('leaves the organizer in their own thread', async () => {
      // Cancelling your own attendance must not orphan the chat you run.
      prisma.conversation.findUnique.mockResolvedValueOnce({
        id: CONVERSATION_ID,
        ownerId: ORGANIZER,
      });

      await service.removeEventParticipant(EVENT_ID, ORGANIZER);

      expect(prisma.conversationParticipant.deleteMany).not.toHaveBeenCalled();
    });

    it('is a no-op when the event has no chat', async () => {
      prisma.conversation.findUnique.mockResolvedValueOnce(null);

      await service.removeEventParticipant(EVENT_ID, PARTICIPANT);

      expect(prisma.conversationParticipant.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('roles, mutes and moderation', () => {
    /** The actor is looked up first, then the target — in that order. */
    const actingAs = (actorRole: string, targetRole = 'MEMBER') => {
      prisma.conversationParticipant.findUnique
        .mockResolvedValueOnce({ userId: ORGANIZER, role: actorRole })
        .mockResolvedValueOnce({ userId: PARTICIPANT, role: targetRole });
    };

    beforeEach(() => {
      prisma.conversation.findUnique.mockResolvedValue(EVENT_CHAT);
      // Answer by identity rather than call order: these methods look the
      // actor up as well as the target, so a flat mock would hand the
      // organizer somebody else's role.
      prisma.conversationParticipant.findUnique.mockImplementation(
        (args: { where: { userId_conversationId: { userId: number } } }) => {
          const { userId } = args.where.userId_conversationId;
          return Promise.resolve({
            userId,
            role: userId === ORGANIZER ? 'OWNER' : 'MEMBER',
            isMuted: false,
            mutedUntil: null,
          });
        },
      );
    });

    describe('setParticipantRole', () => {
      it('lets the organizer hand out any assignable role', async () => {
        for (const role of ['WRITER', 'MODERATOR', 'ADMIN', 'MEMBER']) {
          prisma.conversationParticipant.update.mockClear();
          await service.setParticipantRole(
            ORGANIZER,
            CONVERSATION_ID,
            PARTICIPANT,
            role,
          );
          expect(prisma.conversationParticipant.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { role } }),
          );
        }
      });

      it('refuses a role nobody can be given', async () => {
        // A second owner could demote the first.
        await expect(
          service.setParticipantRole(
            ORGANIZER,
            CONVERSATION_ID,
            PARTICIPANT,
            'OWNER',
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it("refuses to change the organizer's own role", async () => {
        prisma.conversationParticipant.findUnique
          .mockResolvedValueOnce({ userId: ORGANIZER, role: 'OWNER' })
          .mockResolvedValueOnce({ userId: ORGANIZER, role: 'OWNER' });

        await expect(
          service.setParticipantRole(
            ORGANIZER,
            CONVERSATION_ID,
            ORGANIZER,
            'MEMBER',
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('refuses role changes from a moderator', async () => {
        // Moderators police what is said, not who may say it.
        actingAs('MODERATOR');

        await expect(
          service.setParticipantRole(
            ORGANIZER,
            CONVERSATION_ID,
            PARTICIPANT,
            'WRITER',
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('answers 404, not 500, for somebody who already left', async () => {
        prisma.conversationParticipant.findUnique
          .mockResolvedValueOnce({ userId: ORGANIZER, role: 'OWNER' })
          .mockResolvedValueOnce(null);

        await expect(
          service.setParticipantRole(
            ORGANIZER,
            CONVERSATION_ID,
            PARTICIPANT,
            'WRITER',
          ),
        ).rejects.toThrow(NotFoundException);
        expect(prisma.conversationParticipant.update).not.toHaveBeenCalled();
      });
    });

    describe('mute', () => {
      it('mutes for a stretch of time without touching the role', async () => {
        actingAs('OWNER', 'MODERATOR');

        await service.muteParticipant(
          ORGANIZER,
          CONVERSATION_ID,
          PARTICIPANT,
          60,
        );

        const [arg] = prisma.conversationParticipant.update.mock.calls[0] as [
          {
            data: { isMuted: boolean; mutedUntil: Date | null; role?: string };
          },
        ];
        expect(arg.data.isMuted).toBe(true);
        expect(arg.data.mutedUntil).toBeInstanceOf(Date);
        // Silencing somebody must not cost them the rights they were given.
        expect(arg.data.role).toBeUndefined();
      });

      it('mutes with no end date when no duration is given', async () => {
        actingAs('OWNER');

        await service.muteParticipant(ORGANIZER, CONVERSATION_ID, PARTICIPANT);

        expect(prisma.conversationParticipant.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: { isMuted: true, mutedUntil: null },
          }),
        );
      });

      it('lifts a mute', async () => {
        actingAs('OWNER');

        await service.unmuteParticipant(
          ORGANIZER,
          CONVERSATION_ID,
          PARTICIPANT,
        );

        expect(prisma.conversationParticipant.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: { isMuted: false, mutedUntil: null },
          }),
        );
      });

      it('refuses to mute the organizer', async () => {
        actingAs('ADMIN', 'OWNER');

        await expect(
          service.muteParticipant(ORGANIZER, CONVERSATION_ID, PARTICIPANT),
        ).rejects.toThrow(BadRequestException);
      });

      it('refuses to let a moderator mute a co-organizer', async () => {
        // Otherwise a moderator could silence the people who appointed them.
        actingAs('MODERATOR', 'ADMIN');

        await expect(
          service.muteParticipant(ORGANIZER, CONVERSATION_ID, PARTICIPANT),
        ).rejects.toThrow(ForbiddenException);
      });

      it('refuses to let a writer mute anyone', async () => {
        actingAs('WRITER');

        await expect(
          service.muteParticipant(ORGANIZER, CONVERSATION_ID, PARTICIPANT),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('removeParticipant', () => {
      it('lets a moderator remove somebody below them', async () => {
        actingAs('MODERATOR', 'WRITER');

        await service.removeParticipant(
          ORGANIZER,
          CONVERSATION_ID,
          PARTICIPANT,
        );

        expect(prisma.conversationParticipant.delete).toHaveBeenCalledWith({
          where: {
            userId_conversationId: {
              userId: PARTICIPANT,
              conversationId: CONVERSATION_ID,
            },
          },
        });
      });

      it('refuses to remove the organizer', async () => {
        actingAs('ADMIN', 'OWNER');

        await expect(
          service.removeParticipant(ORGANIZER, CONVERSATION_ID, PARTICIPANT),
        ).rejects.toThrow(BadRequestException);
      });

      it('refuses removal by a plain participant', async () => {
        actingAs('MEMBER');

        await expect(
          service.removeParticipant(ORGANIZER, CONVERSATION_ID, PARTICIPANT),
        ).rejects.toThrow(ForbiddenException);
        expect(prisma.conversationParticipant.delete).not.toHaveBeenCalled();
      });
    });

    it('rejects these controls on an ordinary group thread', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: CONVERSATION_ID,
        type: 'GROUP',
        eventId: null,
        ownerId: ORGANIZER,
      });

      await expect(
        service.setParticipantRole(
          ORGANIZER,
          CONVERSATION_ID,
          PARTICIPANT,
          'WRITER',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
