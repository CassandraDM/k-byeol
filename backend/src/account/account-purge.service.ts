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
   * Nothing the user can see changes here — their identity left the moment they
   * confirmed. What ends is the possibility of putting it back: the two restore
   * columns are cleared, and the password hash is replaced with one nobody
   * holds the input to, so the row cannot be turned back into a way in.
   *
   * The row itself stays, because the messages it authored point at it and
   * those belong to conversations other people are still reading.
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
      await this.prisma.user.update({
        where: { id },
        data: {
          restoreEmail: null,
          restoreUsername: null,
          password: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
        },
      });
    }

    return expired.length;
  }
}
