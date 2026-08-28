import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';

/** The public shape of somebody appearing in a follow list. */
export interface FollowListEntry {
  id: number;
  username: string;
  avatar: string | null;
  bio: string | null;
  followedAt: Date;
  /** True when the relationship goes both ways — the two are friends. */
  isFriend: boolean;
}

/**
 * Where the current user stands with somebody else. Returned by every write so
 * the app can repaint the button without a second round trip.
 */
export interface FollowState {
  isFollowing: boolean;
  followsYou: boolean;
  /** Mutual follow. Derived, never stored — see the `Follow` model. */
  isFriend: boolean;
  followerCount: number;
  followingCount: number;
}

@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
  ) {}

  /**
   * Follows a user. Idempotent — following twice is not an error, so a
   * double-tap on a slow connection can't turn into a 409.
   */
  async follow(followerId: number, followingId: number): Promise<FollowState> {
    if (followerId === followingId) {
      throw new BadRequestException('You cannot follow yourself');
    }
    await this.assertVisible(followerId, followingId);

    await this.prisma.follow.upsert({
      where: { followerId_followingId: { followerId, followingId } },
      create: { followerId, followingId },
      update: {},
    });

    return this.state(followerId, followingId);
  }

  /** Unfollows a user. Also idempotent: unfollowing a stranger is a no-op. */
  async unfollow(
    followerId: number,
    followingId: number,
  ): Promise<FollowState> {
    if (followerId === followingId) {
      throw new BadRequestException('You cannot unfollow yourself');
    }
    await this.assertVisible(followerId, followingId);

    await this.prisma.follow.deleteMany({ where: { followerId, followingId } });

    return this.state(followerId, followingId);
  }

  /**
   * The people `targetId` follows, most recent first.
   *
   * Filtered through `viewerId`'s blocks exactly like `listFollowers`, so the
   * two lists behave the same way and the count always matches its rows.
   */
  async listFollowing(targetId: number, viewerId: number) {
    await this.assertVisible(viewerId, targetId);

    const hidden = await this.moderation.hiddenUserIds(viewerId);
    const [rows, backLinks] = await Promise.all([
      this.prisma.follow.findMany({
        where: {
          followerId: targetId,
          ...(hidden.length > 0 ? { followingId: { notIn: hidden } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          following: {
            select: { id: true, username: true, avatar: true, bio: true },
          },
        },
      }),
      // Who follows the target back — that pairing is what makes them friends
      // with the profile being viewed.
      this.prisma.follow.findMany({
        where: { followingId: targetId },
        select: { followerId: true },
      }),
    ]);

    const followsBack = new Set(backLinks.map((f) => f.followerId));

    return {
      count: rows.length,
      following: rows.map((row) => ({
        ...row.following,
        followedAt: row.createdAt,
        isFriend: followsBack.has(row.following.id),
      })) satisfies FollowListEntry[],
    };
  }

  /**
   * A user's followers: always the count, plus the list itself — profiles are
   * public to signed-in users, so there is nothing to withhold.
   *
   * Both are computed from the viewer's side of a block: someone the viewer
   * can't see doesn't appear in the list, and isn't counted either, so the
   * number always matches the rows underneath it.
   */
  async listFollowers(targetId: number, viewerId: number) {
    await this.assertVisible(viewerId, targetId);

    const hidden = await this.moderation.hiddenUserIds(viewerId);
    const rows = await this.prisma.follow.findMany({
      where: {
        followingId: targetId,
        ...(hidden.length > 0 ? { followerId: { notIn: hidden } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        follower: {
          select: { id: true, username: true, avatar: true, bio: true },
        },
      },
    });

    // Who among these followers the target follows back — that pairing is what
    // makes them friends with the profile being viewed.
    const backLinks = await this.prisma.follow.findMany({
      where: {
        followerId: targetId,
        followingId: { in: rows.map((r) => r.follower.id) },
      },
      select: { followingId: true },
    });
    const followedBack = new Set(backLinks.map((f) => f.followingId));

    return {
      count: rows.length,
      followers: rows.map((row) => ({
        ...row.follower,
        followedAt: row.createdAt,
        isFriend: followedBack.has(row.follower.id),
      })) satisfies FollowListEntry[],
    };
  }

  /**
   * The follow counters and relationship shown on a profile.
   * `viewerId` is optional so an unauthenticated read would still get counts.
   */
  async state(viewerId: number | undefined, profileId: number) {
    const [followerCount, followingCount, outgoing, incoming] =
      await Promise.all([
        this.prisma.follow.count({ where: { followingId: profileId } }),
        this.prisma.follow.count({ where: { followerId: profileId } }),
        viewerId === undefined || viewerId === profileId
          ? null
          : this.prisma.follow.findUnique({
              where: {
                followerId_followingId: {
                  followerId: viewerId,
                  followingId: profileId,
                },
              },
              select: { createdAt: true },
            }),
        viewerId === undefined || viewerId === profileId
          ? null
          : this.prisma.follow.findUnique({
              where: {
                followerId_followingId: {
                  followerId: profileId,
                  followingId: viewerId,
                },
              },
              select: { createdAt: true },
            }),
      ]);

    const isFollowing = outgoing !== null;
    const followsYou = incoming !== null;

    return {
      isFollowing,
      followsYou,
      isFriend: isFollowing && followsYou,
      followerCount,
      followingCount,
    } satisfies FollowState;
  }

  /**
   * Everyone who follows `userId` and should hear about what they do.
   *
   * Blocking severs follows in both directions, so this list is already clean;
   * the hidden-ids filter is there so a block that lands mid-flight can't slip
   * a notification through.
   */
  async notifiableFollowerIds(userId: number): Promise<number[]> {
    const [followers, hidden] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followingId: userId },
        select: { followerId: true },
      }),
      this.moderation.hiddenUserIds(userId),
    ]);

    const hiddenSet = new Set(hidden);
    return followers
      .map((f) => f.followerId)
      .filter((id) => id !== userId && !hiddenSet.has(id));
  }

  /**
   * A profile separated from the viewer by a block reads as missing rather
   * than forbidden — the same lie `UsersService.getProfile` tells, because
   * "you are blocked" would confirm the block exists.
   */
  private async assertVisible(viewerId: number, targetId: number) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found');

    if (await this.moderation.isHidden(viewerId, targetId)) {
      throw new NotFoundException('User not found');
    }
  }
}
