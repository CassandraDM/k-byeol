import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import * as bcrypt from 'bcryptjs';

/**
 * The two shapes `getUserEvents` reads: events the user organises, and events
 * they only take part in (those carry their organiser). Deriving them from the
 * Prisma query keeps mapEvent honest — add a field to the `include` and the
 * type follows, instead of an `any` hiding the mismatch.
 */
type OrganizedEvent = Prisma.EventGetPayload<{
  include: { _count: { select: { participations: true } } };
}>;
type ParticipatedEvent = Prisma.EventGetPayload<{
  include: {
    _count: { select: { participations: true } };
    organizer: { select: { id: true; username: true; avatar: true } };
  };
}>;

interface UpdateProfileData {
  username?: string;
  email?: string;
  password?: string;
  avatar?: string;
  bio?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
  ) {}

  /**
   * Returns a user's public profile including their favourite K-pop groups (fandoms).
   */
  async getProfile(userId: number, viewerId?: number) {
    // A blocked profile reads as gone rather than forbidden — saying "you are
    // blocked" would leak that the block exists.
    if (
      viewerId !== undefined &&
      (await this.moderation.isHidden(viewerId, userId))
    ) {
      throw new NotFoundException('User not found');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        avatar: true,
        bio: true,
        createdAt: true,
        preferences: {
          select: {
            cityName: true,
            cityCode: true,
            cityPostalCode: true,
            groups: {
              include: {
                group: { select: { id: true, name: true, slug: true } },
              },
            },
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      bio: user.bio,
      createdAt: user.createdAt,
      city: user.preferences?.cityCode
        ? {
            code: user.preferences.cityCode,
            name: user.preferences.cityName,
            postalCode: user.preferences.cityPostalCode,
          }
        : null,
      fandoms: user.preferences?.groups.map((g) => g.group) ?? [],
    };
  }

  /**
   * Updates a user's username, avatar and/or bio.
   * Checks that the new username isn't already taken by another user.
   */
  async updateProfile(userId: number, data: UpdateProfileData) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (data.username && data.username !== user.username) {
      const existing = await this.prisma.user.findUnique({
        where: { username: data.username },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Username already taken');
      }
    }

    if (data.email && data.email !== user.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: data.email },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Email already in use');
      }
    }

    const hashedPassword = data.password
      ? await bcrypt.hash(data.password, 10)
      : undefined;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        username: data.username ?? undefined,
        email: data.email ?? undefined,
        password: hashedPassword,
        avatar: data.avatar ?? undefined,
        bio: data.bio ?? undefined,
      },
      select: {
        id: true,
        username: true,
        email: true,
        avatar: true,
        bio: true,
      },
    });

    return updated;
  }

  /**
   * Returns a user's events split into upcoming and past buckets.
   * Includes both events they organise and events they're participating in.
   */
  async getUserEvents(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Normalise to start of today so events scheduled today
    // (stored as midnight UTC) still count as "upcoming"
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [organized, participated] = await Promise.all([
      this.prisma.event.findMany({
        where: { organizerId: userId },
        orderBy: { date: 'asc' },
        include: {
          _count: { select: { participations: true } },
        },
      }),
      this.prisma.event.findMany({
        where: {
          participations: { some: { userId } },
        },
        orderBy: { date: 'asc' },
        include: {
          _count: { select: { participations: true } },
          organizer: { select: { id: true, username: true, avatar: true } },
        },
      }),
    ]);

    const mapEvent = (
      e: OrganizedEvent | ParticipatedEvent,
      isOrganizer: boolean,
    ) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      latitude: e.latitude,
      longitude: e.longitude,
      address: e.address,
      date: e.date,
      time: e.time,
      description: e.description,
      imageUrl: e.imageUrl,
      participantCount: e._count.participations,
      isOrganizer,
      organizer: 'organizer' in e ? e.organizer : undefined,
    });

    const organizedMapped = organized.map((e) => mapEvent(e, true));
    const participatedMapped = participated.map((e) => mapEvent(e, false));

    // Deduplicate (a user can both organise AND participate in their event)
    const byId = new Map<number, ReturnType<typeof mapEvent>>();
    for (const e of organizedMapped) byId.set(e.id, e);
    for (const e of participatedMapped) {
      if (!byId.has(e.id)) byId.set(e.id, e);
    }
    const all = Array.from(byId.values());

    return {
      upcoming: all.filter((e) => new Date(e.date) >= today),
      past: all.filter((e) => new Date(e.date) < today),
    };
  }

  /**
   * Returns a user's active marketplace listings.
   * The marketplace feature is not yet implemented, so this returns an empty array.
   */
  async getUserListings(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // TODO: replace with actual Listing model once the marketplace feature is built
    return [];
  }
}
