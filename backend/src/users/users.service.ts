import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface UpdateProfileData {
  username?: string;
  avatar?: string;
  bio?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns a user's public profile including their favourite K-pop groups (fandoms).
   */
  async getProfile(userId: number) {
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

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        username: data.username ?? undefined,
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

    const now = new Date();

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

    const mapEvent = (e: any, isOrganizer: boolean) => ({
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
      organizer: e.organizer,
    });

    const organizedMapped = organized.map((e) => mapEvent(e, true));
    const participatedMapped = participated.map((e) => mapEvent(e, false));

    const all = [...organizedMapped, ...participatedMapped];

    return {
      upcoming: all.filter((e) => e.date >= now),
      past: all.filter((e) => e.date < now),
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
