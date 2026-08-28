import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Files a report against a user or an event.
   *
   * The target is checked so moderators never receive reports pointing at
   * nothing, but the report itself survives the target being deleted — that
   * history is the point of an audit trail.
   */
  async createReport(reporterId: number, dto: CreateReportDto) {
    if (dto.targetType === 'USER') {
      if (dto.targetId === reporterId) {
        throw new BadRequestException('You cannot report yourself');
      }
      const user = await this.prisma.user.findUnique({
        where: { id: dto.targetId },
        select: { id: true },
      });
      if (!user) throw new NotFoundException('User not found');
    } else {
      const event = await this.prisma.event.findUnique({
        where: { id: dto.targetId },
        select: { id: true },
      });
      if (!event) throw new NotFoundException('Event not found');
    }

    const report = await this.prisma.report.create({
      data: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason.trim(),
      },
      select: { id: true, targetType: true, targetId: true, createdAt: true },
    });

    return report;
  }

  /** Blocks a user. Idempotent — blocking twice is not an error. */
  async block(blockerId: number, blockedId: number) {
    if (blockerId === blockedId) {
      throw new BadRequestException('You cannot block yourself');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found');

    await this.prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    });

    // A block ends the follow in both directions. Leaving the rows behind
    // would keep pushing "they just added an event" at two people who have
    // agreed to stop seeing each other.
    await this.prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: blockerId, followingId: blockedId },
          { followerId: blockedId, followingId: blockerId },
        ],
      },
    });

    return {
      blocked: true,
      conflictingEvents: await this.conflicts(blockerId, blockedId),
    };
  }

  /**
   * Events the blocker has joined that this person organises — but only when
   * the hide-their-events preference is on, because that is the only case
   * where the block would make an event they signed up for vanish.
   *
   * Returned by `block()` so the app can offer a way out in the same breath
   * rather than silently dropping the event off their map.
   */
  private async conflicts(blockerId: number, blockedId: number) {
    const prefs = await this.prisma.userPreferences.findUnique({
      where: { userId: blockerId },
      select: { hideBlockedEvents: true },
    });
    if (!(prefs?.hideBlockedEvents ?? true)) return [];

    return this.prisma.event.findMany({
      where: {
        organizerId: blockedId,
        participations: { some: { userId: blockerId } },
      },
      select: { id: true, title: true },
      orderBy: { date: 'asc' },
    });
  }

  /** Lifts a block. Only the user who filed it can lift it. */
  async unblock(blockerId: number, blockedId: number) {
    await this.prisma.block.deleteMany({ where: { blockerId, blockedId } });
    return { blocked: false };
  }

  /**
   * Every user id `userId` should no longer see, in either direction.
   *
   * Blocking cuts visibility both ways: the person who blocked stops seeing
   * their target, and the target stops seeing them. A one-way block would let
   * the blocked party keep watching and messaging, which is the behaviour
   * store moderation reviews reject.
   */
  async hiddenUserIds(userId: number): Promise<number[]> {
    const blocks = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });

    const ids = new Set<number>();
    for (const b of blocks) {
      ids.add(b.blockerId === userId ? b.blockedId : b.blockerId);
    }
    return Array.from(ids);
  }

  /** True when the two users are separated by a block, either way round. */
  async isHidden(userId: number, otherId: number): Promise<boolean> {
    if (userId === otherId) return false;
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: otherId },
          { blockerId: otherId, blockedId: userId },
        ],
      },
      select: { blockerId: true },
    });
    return block !== null;
  }

  /** The users this user has blocked themselves, for a manage-blocks screen. */
  async listBlocked(userId: number) {
    const blocks = await this.prisma.block.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        blocked: { select: { id: true, username: true, avatar: true } },
      },
    });

    return blocks.map((b) => ({ ...b.blocked, blockedAt: b.createdAt }));
  }
}
