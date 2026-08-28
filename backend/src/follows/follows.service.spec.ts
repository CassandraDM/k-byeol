import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FollowsService } from './follows.service';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';

const ME = 1;
const THEM = 2;

/** A row as Prisma returns it from `follow.findUnique`. */
const EDGE = { createdAt: new Date('2026-08-01T10:00:00.000Z') };

describe('FollowsService', () => {
  let service: FollowsService;
  let prisma: {
    user: { findUnique: jest.Mock };
    follow: {
      upsert: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
    };
  };
  let moderation: { isHidden: jest.Mock; hiddenUserIds: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: THEM }) },
      follow: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    moderation = {
      isHidden: jest.fn().mockResolvedValue(false),
      hiddenUserIds: jest.fn().mockResolvedValue([]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        FollowsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ModerationService, useValue: moderation },
      ],
    }).compile();

    service = moduleRef.get(FollowsService);
  });

  describe('follow', () => {
    it('refuses to let a user follow themselves', async () => {
      await expect(service.follow(ME, ME)).rejects.toThrow(BadRequestException);
      expect(prisma.follow.upsert).not.toHaveBeenCalled();
    });

    it('reports a user who does not exist as missing', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.follow(ME, THEM)).rejects.toThrow(NotFoundException);
    });

    it('hides a blocked user behind a 404 rather than admitting the block', async () => {
      moderation.isHidden.mockResolvedValueOnce(true);
      await expect(service.follow(ME, THEM)).rejects.toThrow(NotFoundException);
      expect(prisma.follow.upsert).not.toHaveBeenCalled();
    });

    it('upserts so a double tap is not an error', async () => {
      await service.follow(ME, THEM);

      expect(prisma.follow.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            followerId_followingId: { followerId: ME, followingId: THEM },
          },
          update: {},
        }),
      );
    });

    it('reports friendship once the follow goes both ways', async () => {
      // Both directions resolve to a row: outgoing, then incoming.
      prisma.follow.findUnique.mockResolvedValue(EDGE);
      prisma.follow.count.mockResolvedValue(1);

      await expect(service.follow(ME, THEM)).resolves.toEqual({
        isFollowing: true,
        followsYou: true,
        isFriend: true,
        followerCount: 1,
        followingCount: 1,
      });
    });

    it('is not friendship when only one side follows', async () => {
      prisma.follow.findUnique
        .mockResolvedValueOnce(EDGE) // me → them
        .mockResolvedValueOnce(null); // them → me

      const state = await service.follow(ME, THEM);

      expect(state.isFollowing).toBe(true);
      expect(state.followsYou).toBe(false);
      expect(state.isFriend).toBe(false);
    });
  });

  describe('unfollow', () => {
    it('deletes only the row pointing one way', async () => {
      await service.unfollow(ME, THEM);

      expect(prisma.follow.deleteMany).toHaveBeenCalledWith({
        where: { followerId: ME, followingId: THEM },
      });
    });

    it('is a no-op rather than an error when there was no follow', async () => {
      prisma.follow.deleteMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.unfollow(ME, THEM)).resolves.toMatchObject({
        isFollowing: false,
      });
    });
  });

  describe('listFollowing', () => {
    it('marks the people who follow back as friends', async () => {
      prisma.follow.findMany
        .mockResolvedValueOnce([
          {
            createdAt: EDGE.createdAt,
            following: {
              id: THEM,
              username: 'Mimi',
              avatar: null,
              bio: 'ATEEZ 4ever',
            },
          },
          {
            createdAt: EDGE.createdAt,
            following: { id: 3, username: 'Yuna', avatar: null, bio: null },
          },
        ])
        // Only THEM follows back.
        .mockResolvedValueOnce([{ followerId: THEM }]);

      const result = await service.listFollowing(ME, ME);

      expect(result.count).toBe(2);
      expect(result.following).toEqual([
        expect.objectContaining({ id: THEM, isFriend: true }),
        expect.objectContaining({ id: 3, isFriend: false }),
      ]);
    });

    it('reads another profile without confusing it for the viewer', async () => {
      await service.listFollowing(THEM, ME);

      expect(prisma.follow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { followerId: THEM } }),
      );
    });

    it('leaves out the people the viewer cannot see, count included', async () => {
      moderation.hiddenUserIds.mockResolvedValueOnce([9]);
      prisma.follow.findMany
        .mockResolvedValueOnce([
          {
            createdAt: EDGE.createdAt,
            following: { id: 3, username: 'Yuna', avatar: null, bio: null },
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.listFollowing(THEM, ME);

      expect(prisma.follow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { followerId: THEM, followingId: { notIn: [9] } },
        }),
      );
      expect(result.count).toBe(1);
    });

    it('hides a blocked profile behind a 404 rather than listing it', async () => {
      moderation.isHidden.mockResolvedValueOnce(true);

      await expect(service.listFollowing(THEM, ME)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listFollowers', () => {
    it('leaves out the people the viewer cannot see, count included', async () => {
      moderation.hiddenUserIds.mockResolvedValueOnce([9]);
      prisma.follow.findMany
        .mockResolvedValueOnce([
          {
            createdAt: EDGE.createdAt,
            follower: { id: 3, username: 'Yuna', avatar: null, bio: null },
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.listFollowers(THEM, ME);

      expect(prisma.follow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { followingId: THEM, followerId: { notIn: [9] } },
        }),
      );
      // The count is the length of the list the viewer actually gets, so the
      // number can never disagree with the rows under it.
      expect(result.count).toBe(1);
      expect(result.followers).toHaveLength(1);
    });
  });

  describe('notifiableFollowerIds', () => {
    it('drops anyone separated by a block', async () => {
      prisma.follow.findMany.mockResolvedValueOnce([
        { followerId: 3 },
        { followerId: 4 },
      ]);
      moderation.hiddenUserIds.mockResolvedValueOnce([4]);

      await expect(service.notifiableFollowerIds(THEM)).resolves.toEqual([3]);
    });
  });

  describe('state', () => {
    it('never claims a user follows themselves', async () => {
      prisma.follow.count.mockResolvedValue(2);

      const state = await service.state(ME, ME);

      expect(state).toMatchObject({
        isFollowing: false,
        followsYou: false,
        isFriend: false,
        followerCount: 2,
        followingCount: 2,
      });
      expect(prisma.follow.findUnique).not.toHaveBeenCalled();
    });
  });
});
