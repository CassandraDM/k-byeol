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
    $transaction: jest.Mock;
    user: { findMany: jest.Mock; update: jest.Mock };
    event: { deleteMany: jest.Mock };
    eventParticipation: { deleteMany: jest.Mock };
    conversationParticipant: { deleteMany: jest.Mock };
    follow: { deleteMany: jest.Mock };
    block: { deleteMany: jest.Mock };
    userPreferences: { deleteMany: jest.Mock };
    deviceToken: { deleteMany: jest.Mock };
    passwordResetToken: { deleteMany: jest.Mock };
    emailVerificationToken: { deleteMany: jest.Mock };
    groupRequest: { deleteMany: jest.Mock };
    message: { deleteMany: jest.Mock };
    report: { deleteMany: jest.Mock };
  };

  beforeEach(() => {
    const collection = () => ({
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    });

    prisma = {
      $transaction: jest.fn().mockResolvedValue([]),
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      event: collection(),
      eventParticipation: collection(),
      conversationParticipant: collection(),
      follow: collection(),
      block: collection(),
      userPreferences: collection(),
      deviceToken: collection(),
      passwordResetToken: collection(),
      emailVerificationToken: collection(),
      groupRequest: collection(),
      message: collection(),
      report: collection(),
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

  it('destroys what the deletion only hid', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 4 }]);

    await service.purgeExpiredAccounts();

    expect(prisma.event.deleteMany).toHaveBeenCalledWith({
      where: { organizerId: 4 },
    });
    expect(prisma.eventParticipation.deleteMany).toHaveBeenCalledWith({
      where: { userId: 4 },
    });
    expect(prisma.conversationParticipant.deleteMany).toHaveBeenCalledWith({
      where: { userId: 4 },
    });
    // Cut both ways: a follow or a block names two people.
    expect(prisma.follow.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ followerId: 4 }, { followingId: 4 }] },
    });
    expect(prisma.block.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ blockerId: 4 }, { blockedId: 4 }] },
    });
    expect(prisma.deviceToken.deleteMany).toHaveBeenCalled();
    expect(prisma.userPreferences.deleteMany).toHaveBeenCalled();
    // All of it or none of it.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('keeps the messages and the reports', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 4 }]);

    await service.purgeExpiredAccounts();

    // Messages belong to conversations other people are still reading, and
    // sender_id is not nullable. Reports are about somebody else's behaviour.
    expect(prisma.message.deleteMany).not.toHaveBeenCalled();
    expect(prisma.report.deleteMany).not.toHaveBeenCalled();
  });

  it('clears what a reactivation would have needed', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 4 }]);

    await service.purgeExpiredAccounts();

    const calls = prisma.user.update.mock.calls as [
      { where: { id: number }; data: Record<string, unknown> },
    ][];
    const { where, data } = calls[0][0];
    expect(where).toEqual({ id: 4 });
    expect(data.restoreEmail).toBeNull();
    expect(data.restoreUsername).toBeNull();
    expect(data.restoreAvatar).toBeNull();
    expect(data.restoreBio).toBeNull();
    // A hash of something nobody holds: the row survives for the messages that
    // point at it, but it can never become a way in again.
    expect(data.password).toEqual(expect.any(String));
    // The row itself stays, and stays marked deleted.
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
