import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return event;
  }

  async findByLocation(lat: number, lng: number, radius: number, userId: number) {
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
      SELECT *, (
        6371 * acos(
          cos(radians(${lat})) * cos(radians(latitude)) *
          cos(radians(longitude) - radians(${lng})) +
          sin(radians(${lat})) * sin(radians(latitude))
        )
      ) AS distance
      FROM events
      WHERE (
        6371 * acos(
          cos(radians(${lat})) * cos(radians(latitude)) *
          cos(radians(longitude) - radians(${lng})) +
          sin(radians(${lat})) * sin(radians(latitude))
        )
      ) <= ${radius}
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
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        organizer: {
          select: { id: true, username: true, avatar: true },
        },
        _count: { select: { participations: true } },
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

    return { message: 'Participation cancelled' };
  }
}
