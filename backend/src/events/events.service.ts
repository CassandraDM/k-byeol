import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { FollowsService } from '../follows/follows.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversationsService } from '../conversations/conversations.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { Prisma } from '@prisma/client';

/** Everything `GET /events` can narrow the map down by. */
export interface EventFilters {
  lat: number;
  lng: number;
  radiusKm: number;
  /** Free-text match on title or description. */
  q?: string;
  /** Inclusive date bounds, as YYYY-MM-DD. */
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly follows: FollowsService,
    private readonly notifications: NotificationsService,
    private readonly conversations: ConversationsService,
  ) {}

  async create(organizerId: number, dto: CreateEventDto) {
    const event = await this.prisma.event.create({
      data: {
        title: dto.title,
        type: dto.type,
        latitude: dto.latitude,
        longitude: dto.longitude,
        address: dto.address,
        date: new Date(dto.date),
        time: dto.time,
        description: dto.description,
        imageUrl: dto.imageUrl ?? null,
        organizerId,
      },
    });

    await this.openGroupChat(event.id);
    await this.announceToFollowers(organizerId, event);

    return event;
  }

  /**
   * Opens the event's group chat with the organizer at the helm.
   *
   * Best-effort, like the follower announcement: the event is already saved by
   * the time this runs, so throwing here would answer 500 for an event that
   * exists. Joining the event creates the thread too, so a failure here is
   * repaired by the first person who signs up.
   */
  private async openGroupChat(eventId: number): Promise<void> {
    try {
      await this.conversations.ensureEventConversation(eventId);
    } catch (e) {
      this.logger.error(
        `Could not open the chat for event ${eventId}`,
        e as Error,
      );
    }
  }

  /**
   * Tells the organizer's followers that a new event just went up — the whole
   * point of following someone.
   *
   * Deliberately swallows its own errors: a push that fails must never undo an
   * event the user has already successfully created.
   */
  private async announceToFollowers(
    organizerId: number,
    event: { id: number; title: string; address: string },
  ): Promise<void> {
    try {
      const [followerIds, organizer] = await Promise.all([
        this.follows.notifiableFollowerIds(organizerId),
        this.prisma.user.findUnique({
          where: { id: organizerId },
          select: { username: true },
        }),
      ]);
      if (followerIds.length === 0 || !organizer) return;

      this.logger.log(
        `Announcing event ${event.id} to ${followerIds.length} follower(s)`,
      );

      await this.notifications.sendToUsers(followerIds, {
        title: `${organizer.username} added an event`,
        body: `${event.title} — ${event.address}`,
        data: { type: 'event', eventId: event.id },
      });
    } catch (e) {
      this.logger.error(
        `Could not announce event ${event.id} to followers`,
        e as Error,
      );
    }
  }

  async findByLocation(userId: number, filters: EventFilters) {
    const { lat, lng, radiusKm, q, dateFrom, dateTo } = filters;

    // Opt-out setting: by default a blocked person's events stay off the map.
    const prefs = await this.prisma.userPreferences.findUnique({
      where: { userId },
      select: { hideBlockedEvents: true },
    });
    const hideBlockedEvents = prefs?.hideBlockedEvents ?? true;
    const hidden = hideBlockedEvents
      ? await this.moderation.hiddenUserIds(userId)
      : [];

    // The haversine distance in km, reused by SELECT, WHERE and ORDER BY.
    // `least(1, …)` guards against floating-point drift pushing the argument
    // just past 1, which would make acos() return NaN for an event sitting on
    // the exact search coordinates and silently drop it from the results.
    const distance = Prisma.sql`(
      6371 * acos(
        least(1,
          cos(radians(${lat})) * cos(radians(latitude)) *
          cos(radians(longitude) - radians(${lng})) +
          sin(radians(${lat})) * sin(radians(latitude))
        )
      )
    )`;

    const conditions: Prisma.Sql[] = [Prisma.sql`${distance} <= ${radiusKm}`];

    if (q) {
      // Escape LIKE wildcards so a literal "%" or "_" typed in the search bar
      // matches that character instead of standing in for anything.
      const escaped = q.replace(/[\\%_]/g, (char) => '\\' + char);
      const pattern = `%${escaped}%`;
      conditions.push(
        Prisma.sql`(title ILIKE ${pattern} OR description ILIKE ${pattern})`,
      );
    }
    if (dateFrom) {
      conditions.push(Prisma.sql`date >= ${dateFrom}::date`);
    }
    if (dateTo) {
      conditions.push(Prisma.sql`date <= ${dateTo}::date`);
    }
    if (hidden.length > 0) {
      conditions.push(Prisma.sql`organizer_id NOT IN (${Prisma.join(hidden)})`);
    }

    const events = await this.prisma.$queryRaw<
      Array<{
        id: number;
        title: string;
        type: string;
        latitude: number;
        longitude: number;
        address: string;
        date: Date;
        time: string;
        description: string;
        image_url: string | null;
        organizer_id: number;
        created_at: Date;
        updated_at: Date;
        distance: number;
      }>
    >(Prisma.sql`
      SELECT *, ${distance} AS distance
      FROM events
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY distance
    `);

    // Check participation for all returned events in one query
    const eventIds = events.map((e) => e.id);
    const participations = eventIds.length
      ? await this.prisma.eventParticipation.findMany({
          where: { userId, eventId: { in: eventIds } },
          select: { eventId: true },
        })
      : [];
    const participatingIds = new Set(participations.map((p) => p.eventId));

    return events.map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      latitude: e.latitude,
      longitude: e.longitude,
      address: e.address,
      date: e.date,
      time: e.time,
      description: e.description,
      imageUrl: e.image_url,
      organizerId: e.organizer_id,
      distance: Math.round(e.distance * 100) / 100,
      isParticipating: participatingIds.has(e.id),
      createdAt: e.created_at,
    }));
  }

  async findById(id: number, userId: number) {
    const hidden = await this.moderation.hiddenUserIds(userId);

    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        organizer: {
          select: { id: true, username: true, avatar: true },
        },
        _count: {
          select: {
            // Blocked people are invisible, so they must not be counted either.
            participations: { where: { userId: { notIn: hidden } } },
          },
        },
        participations: {
          where: { userId },
          select: { userId: true },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return {
      id: event.id,
      title: event.title,
      type: event.type,
      latitude: event.latitude,
      longitude: event.longitude,
      address: event.address,
      date: event.date,
      time: event.time,
      description: event.description,
      imageUrl: event.imageUrl,
      organizer: event.organizer,
      participantCount: event._count.participations,
      isParticipating: event.participations.length > 0,
      createdAt: event.createdAt,
    };
  }

  /**
   * Who is going, minus anyone blocked either way round. The organizer is
   * listed first — they're the reference point for the whole event.
   */
  async findParticipants(eventId: number, viewerId: number) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        organizerId: true,
        organizer: { select: { id: true, username: true, avatar: true } },
      },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const hidden = await this.moderation.hiddenUserIds(viewerId);

    const participations = await this.prisma.eventParticipation.findMany({
      where: {
        eventId,
        userId: { notIn: [...hidden, event.organizerId] },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        user: { select: { id: true, username: true, avatar: true } },
      },
    });

    const organizerHidden = hidden.includes(event.organizerId);

    return [
      ...(organizerHidden ? [] : [{ ...event.organizer, isOrganizer: true }]),
      ...participations.map((p) => ({ ...p.user, isOrganizer: false })),
    ];
  }

  async participate(userId: number, eventId: number) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const existing = await this.prisma.eventParticipation.findUnique({
      where: { userId_eventId: { userId, eventId } },
    });
    if (existing) {
      throw new ConflictException('Already participating in this event');
    }

    await this.prisma.eventParticipation.create({
      data: { userId, eventId },
    });

    // Joining the event puts you in its chat, read-only until the organizer
    // says otherwise. Best-effort: participation is confirmed either way.
    try {
      await this.conversations.addEventParticipant(eventId, userId);
    } catch (e) {
      this.logger.error(
        `Could not add user ${userId} to the chat for event ${eventId}`,
        e as Error,
      );
    }

    return { message: 'Participation confirmed' };
  }

  async cancelParticipation(userId: number, eventId: number) {
    const existing = await this.prisma.eventParticipation.findUnique({
      where: { userId_eventId: { userId, eventId } },
    });
    if (!existing) {
      throw new NotFoundException('Participation not found');
    }

    await this.prisma.eventParticipation.delete({
      where: { userId_eventId: { userId, eventId } },
    });

    // Leaving the event leaves its chat.
    try {
      await this.conversations.removeEventParticipant(eventId, userId);
    } catch (e) {
      this.logger.error(
        `Could not remove user ${userId} from the chat for event ${eventId}`,
        e as Error,
      );
    }

    return { message: 'Participation cancelled' };
  }

  async update(userId: number, eventId: number, dto: UpdateEventDto) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (event.organizerId !== userId) {
      throw new ForbiddenException('You are not the organizer of this event');
    }

    // Moving the event re-arms the "starts in 1 hour" reminder — the one we
    // may already have sent was for the old slot.
    const rescheduled =
      (dto.date !== undefined &&
        new Date(dto.date).getTime() !== event.date.getTime()) ||
      (dto.time !== undefined && dto.time !== event.time);

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
        ...(dto.time !== undefined && { time: dto.time }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(rescheduled && { reminderSentAt: null }),
      },
    });
    return updated;
  }

  async remove(userId: number, eventId: number) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (event.organizerId !== userId) {
      throw new ForbiddenException('You are not the organizer of this event');
    }

    await this.prisma.event.delete({ where: { id: eventId } });
    return { message: 'Event deleted' };
  }
}
