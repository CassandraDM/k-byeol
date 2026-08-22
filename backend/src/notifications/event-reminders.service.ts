import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

/** How far ahead of an event we warn everyone who's going. */
const REMINDER_LEAD_MINUTES = 60;

@Injectable()
export class EventRemindersService {
  private readonly logger = new Logger(EventRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Every 5 minutes, pushes a "starts in 1 hour" reminder to the organizer and
   * everyone participating in an event about to begin.
   *
   * `reminderSentAt` is stamped first so a slow send can't cause a second run
   * to notify the same event twice.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async sendUpcomingEventReminders(): Promise<void> {
    try {
      await this.remindUpcoming();
    } catch (e) {
      this.logger.error('Event reminder sweep failed', e as Error);
    }
  }

  private async remindUpcoming(): Promise<void> {
    const now = new Date();
    const deadline = new Date(now.getTime() + REMINDER_LEAD_MINUTES * 60_000);

    // `date` is a DATE column, so narrow to the days the window can touch and
    // do the exact hour/minute comparison in JS.
    const candidates = await this.prisma.event.findMany({
      where: {
        reminderSentAt: null,
        date: {
          gte: this.startOfUtcDay(now, -1),
          lte: this.startOfUtcDay(now, 1),
        },
      },
      select: {
        id: true,
        title: true,
        date: true,
        time: true,
        organizerId: true,
      },
    });

    for (const event of candidates) {
      const startsAt = this.eventStartsAt(event.date, event.time);
      if (!startsAt) continue;
      if (startsAt <= now || startsAt > deadline) continue;

      await this.prisma.event.update({
        where: { id: event.id },
        data: { reminderSentAt: new Date() },
      });

      const participants = await this.prisma.eventParticipation.findMany({
        where: { eventId: event.id },
        select: { userId: true },
      });

      const recipients = [
        event.organizerId,
        ...participants.map((p) => p.userId),
      ];

      this.logger.log(
        `Reminding ${recipients.length} user(s) about event ${event.id} ("${event.title}")`,
      );

      await this.notifications.sendToUsers(recipients, {
        title: 'Starting in 1 hour',
        body: `${event.title} kicks off soon — time to head over!`,
        data: { type: 'event', eventId: event.id },
      });
    }
  }

  /**
   * Combines the stored DATE (UTC midnight) with the "HH:mm" wall-clock time
   * into an instant. The time is interpreted in the server's timezone, which
   * is where the events take place.
   */
  private eventStartsAt(date: Date, time: string): Date | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!match) {
      return null;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
      return null;
    }

    return new Date(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      hours,
      minutes,
      0,
      0,
    );
  }

  /** UTC midnight of today shifted by `dayOffset` days. */
  private startOfUtcDay(from: Date, dayOffset: number): Date {
    return new Date(
      Date.UTC(
        from.getUTCFullYear(),
        from.getUTCMonth(),
        from.getUTCDate() + dayOffset,
      ),
    );
  }
}
