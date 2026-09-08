import { AccountPurgeService } from './account-purge.service';
import { GRACE_PERIOD_DAYS } from './account.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The sweep that closes the grace period. Nothing a user can see changes here
 * — their identity left when they confirmed. What ends is the possibility of
 * putting it back.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

describe('AccountPurgeService', () => {
  let service: AccountPurgeService;
  let prisma: {
    user: { findMany: jest.Mock; update: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    service = new AccountPurgeService(prisma as unknown as PrismaService);
  });

  it('only asks for accounts past the grace period that still have something to clear', async () => {
    await service.purgeExpiredAccounts();

    const calls = prisma.user.findMany.mock.calls as [
      { where: { deletedAt: { lt: Date }; restoreEmail: { not: null } } },
    ][];
    const { where } = calls[0][0];
    const cutoff = where.deletedAt.lt;

    // Comparing to the day rather than the millisecond: the sweep computes its
    // own `now`, so an exact equality would be a clock race.
    expect(cutoff.getTime()).toBeLessThanOrEqual(
      daysAgo(GRACE_PERIOD_DAYS).getTime() + 5_000,
    );
    expect(cutoff.getTime()).toBeGreaterThan(
      daysAgo(GRACE_PERIOD_DAYS + 1).getTime(),
    );
    // Rows already purged have nothing left to clear, and re-writing them
    // every night forever would be the sweep's only visible effect.
    expect(where.restoreEmail).toEqual({ not: null });
  });

  it('clears what a restore would have needed, and nothing else', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 4 }]);

    await service.purgeExpiredAccounts();

    const calls = prisma.user.update.mock.calls as [
      { where: { id: number }; data: Record<string, unknown> },
    ][];
    const { where, data } = calls[0][0];
    expect(where).toEqual({ id: 4 });
    expect(data.restoreEmail).toBeNull();
    expect(data.restoreUsername).toBeNull();
    // A hash of something nobody holds: the row survives for the messages that
    // point at it, but it can never become a way in again.
    expect(data.password).toEqual(expect.any(String));
    // The row itself stays — its messages are other people's threads.
    expect(data).not.toHaveProperty('deletedAt');
  });

  it('does nothing when no account has aged out', async () => {
    await service.purgeExpiredAccounts();

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('swallows a failed sweep rather than crashing the scheduler', async () => {
    prisma.user.findMany.mockRejectedValue(new Error('database is away'));

    await expect(service.purgeExpiredAccounts()).resolves.toBeUndefined();
  });
});
