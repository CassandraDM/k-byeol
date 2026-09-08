import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { GRACE_PERIOD_DAYS } from './account.service';

@Injectable()
export class AccountPurgeService {
  private readonly logger = new Logger(AccountPurgeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Closes the grace period on accounts deleted more than GRACE_PERIOD_DAYS
   * ago, once a day.
   *
   * This is where a deletion finally becomes one. Until now the account and
   * everything it owned were only hidden, so that reactivating gave it all back
   * as it was; here the events it organised, its participations, memberships,
   * follows, blocks, preferences and devices are destroyed for real, and the
   * restore columns are cleared so the identity can never come back either.
   *
   * Nothing the user could see changes — all of it went dark thirty days ago.
   * What ends is the possibility of undoing it.
   *
   * The row itself stays, and so do its messages: they belong to conversations
   * other people are still reading, and `messages.sender_id` is not nullable.
   * Its password is replaced with a hash of something nobody holds, so the row
   * cannot be turned back into a way in.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredAccounts(): Promise<void> {
    try {
      const purged = await this.purge();
      if (purged > 0) {
        this.logger.log(
          `Grace period closed on ${purged} deleted account(s) — no longer restorable`,
        );
      }
    } catch (e) {
      this.logger.error('Account purge sweep failed', e as Error);
    }
  }

  private async purge(): Promise<number> {
    const cutoff = new Date(
      Date.now() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
    );

    const expired = await this.prisma.user.findMany({
      where: {
        deletedAt: { lt: cutoff },
        // Already purged rows have nothing left to clear; skipping them keeps
        // the sweep from rewriting the same rows every night forever.
        restoreEmail: { not: null },
      },
      select: { id: true },
    });

    for (const { id } of expired) {
      // A password nobody holds the input to. Hashed per row rather than once
      // for the sweep so two purged accounts never share a hash.
      const purgedPassword = await bcrypt.hash(
        randomBytes(32).toString('hex'),
        10,
      );

      await this.prisma.$transaction([
        // Their listings. Destroying an event takes its group chat with it,
        // the same as cancelling one does.
        this.prisma.event.deleteMany({ where: { organizerId: id } }),

        // Everywhere they had signed up to be.
        this.prisma.eventParticipation.deleteMany({ where: { userId: id } }),
        this.prisma.conversationParticipant.deleteMany({
          where: { userId: id },
        }),

        // The social graph, cut from both sides.
        this.prisma.follow.deleteMany({
          where: { OR: [{ followerId: id }, { followingId: id }] },
        }),
        this.prisma.block.deleteMany({
          where: { OR: [{ blockerId: id }, { blockedId: id }] },
        }),

        // Personal data, devices and anything still pending.
        this.prisma.userPreferences.deleteMany({ where: { userId: id } }),
        this.prisma.deviceToken.deleteMany({ where: { userId: id } }),
        this.prisma.passwordResetToken.deleteMany({ where: { userId: id } }),
        this.prisma.emailVerificationToken.deleteMany({
          where: { userId: id },
        }),
        this.prisma.groupRequest.deleteMany({ where: { userId: id } }),

        // Last: the identity itself, which is what makes this irreversible.
        // Reports the account filed are deliberately left standing — they are
        // about somebody else's behaviour, and moderation would lose the trail.
        this.prisma.user.update({
          where: { id },
          data: {
            restoreEmail: null,
            restoreUsername: null,
            restoreAvatar: null,
            restoreBio: null,
            password: purgedPassword,
          },
        }),
      ]);
    }

    return expired.length;
  }
}
