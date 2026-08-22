import { Test } from '@nestjs/testing';
import { EventRemindersService } from './event-reminders.service';
import { NotificationsService, PushPayload } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Builds the DATE value Postgres hands back for a `@db.Date` column:
 * midnight UTC on that calendar day.
 */
function dateColumn(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** An instant on that calendar day, in the server's timezone. */
function localInstant(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
): Date {
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

describe('EventRemindersService — "starts in 1 hour"', () => {
  let service: EventRemindersService;
  let prisma: {
    event: { findMany: jest.Mock; update: jest.Mock };
    eventParticipation: { findMany: jest.Mock };
  };
  let notifications: { sendToUsers: jest.Mock };

  const event = {
    id: 7,
    title: 'Random Play Dance',
    date: dateColumn(2026, 8, 22),
    time: '20:00',
    organizerId: 1,
  };

  beforeEach(async () => {
    prisma = {
      event: {
        findMany: jest.fn().mockResolvedValue([event]),
        update: jest.fn(),
      },
      eventParticipation: {
        findMany: jest.fn().mockResolvedValue([{ userId: 2 }, { userId: 3 }]),
      },
    };
    notifications = { sendToUsers: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        EventRemindersService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = moduleRef.get(EventRemindersService);
  });

  afterEach(() => jest.useRealTimers());

  /** Freezes the clock at a wall-clock instant in the server's timezone. */
  function at(hours: number, minutes: number) {
    jest
      .useFakeTimers()
      .setSystemTime(localInstant(2026, 8, 22, hours, minutes));
  }

  it('notifies the organizer and every participant inside the window', async () => {
    at(19, 10); // 50 minutes before a 20:00 start

    await service.sendUpcomingEventReminders();

    expect(notifications.sendToUsers).toHaveBeenCalledTimes(1);
    const [recipients, payload] = notifications.sendToUsers.mock.calls[0] as [
      number[],
      PushPayload,
    ];
    expect(recipients).toEqual([1, 2, 3]);
    expect(payload.data).toEqual({ type: 'event', eventId: 7 });
    expect(payload.body).toContain('Random Play Dance');
  });

  it('stamps reminderSentAt so a second sweep stays quiet', async () => {
    at(19, 10);

    await service.sendUpcomingEventReminders();

    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { reminderSentAt: expect.any(Date) as Date },
    });
  });

  it('stays quiet more than an hour out', async () => {
    at(18, 30); // 90 minutes before

    await service.sendUpcomingEventReminders();

    expect(notifications.sendToUsers).not.toHaveBeenCalled();
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('stays quiet once the event has started', async () => {
    at(20, 5); // 5 minutes late

    await service.sendUpcomingEventReminders();

    expect(notifications.sendToUsers).not.toHaveBeenCalled();
  });

  it('skips events whose time is malformed rather than throwing', async () => {
    prisma.event.findMany.mockResolvedValue([{ ...event, time: 'soon' }]);
    at(19, 10);

    await expect(service.sendUpcomingEventReminders()).resolves.toBeUndefined();
    expect(notifications.sendToUsers).not.toHaveBeenCalled();
  });

  it('swallows a database failure so the scheduler survives', async () => {
    prisma.event.findMany.mockRejectedValue(new Error('connection lost'));
    at(19, 10);

    await expect(service.sendUpcomingEventReminders()).resolves.toBeUndefined();
  });
});
