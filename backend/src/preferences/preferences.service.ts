import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async getPreferences(userId: number) {
    const prefs = await this.prisma.userPreferences.findUnique({
      where: { userId },
      include: {
        groups: {
          include: { group: true },
        },
      },
    });

    if (!prefs) {
      // Mirror the column default so a user with no row yet still gets the
      // protective setting rather than `undefined`.
      return {
        city: null,
        groups: [],
        hideBlockedEvents: true,
      };
    }

    return {
      city: prefs.cityCode
        ? {
            code: prefs.cityCode,
            nom: prefs.cityName,
            codePostal: prefs.cityPostalCode,
          }
        : null,
      groups: prefs.groups.map((pg) => ({
        id: pg.group.id,
        name: pg.group.name,
        slug: pg.group.slug,
      })),
      hideBlockedEvents: prefs.hideBlockedEvents,
    };
  }

  async updatePreferences(userId: number, dto: UpdatePreferencesDto) {
    // Validate that all requested group IDs exist
    if (dto.groupIds?.length) {
      const existingGroups = await this.prisma.kpopGroup.findMany({
        where: { id: { in: dto.groupIds } },
        select: { id: true },
      });

      if (existingGroups.length !== dto.groupIds.length) {
        const foundIds = existingGroups.map((g) => g.id);
        const invalidIds = dto.groupIds.filter((id) => !foundIds.includes(id));
        throw new BadRequestException(
          `Invalid group IDs: ${invalidIds.join(', ')}`,
        );
      }
    }

    // Upsert the preferences record
    const prefs = await this.prisma.userPreferences.upsert({
      where: { userId },
      create: {
        userId,
        cityCode: dto.cityCode ?? null,
        cityName: dto.cityName ?? null,
        cityPostalCode: dto.cityPostalCode ?? null,
        ...(dto.hideBlockedEvents !== undefined && {
          hideBlockedEvents: dto.hideBlockedEvents,
        }),
      },
      update: {
        cityCode: dto.cityCode ?? undefined,
        cityName: dto.cityName ?? undefined,
        cityPostalCode: dto.cityPostalCode ?? undefined,
        hideBlockedEvents: dto.hideBlockedEvents ?? undefined,
      },
    });

    // Update favourite groups if provided
    if (dto.groupIds !== undefined) {
      // Delete existing associations
      await this.prisma.userPreferencesGroup.deleteMany({
        where: { preferencesId: prefs.id },
      });

      // Create new associations
      if (dto.groupIds.length > 0) {
        await this.prisma.userPreferencesGroup.createMany({
          data: dto.groupIds.map((groupId) => ({
            preferencesId: prefs.id,
            groupId,
          })),
        });
      }
    }

    return this.getPreferences(userId);
  }

  async getAllGroups() {
    return this.prisma.kpopGroup.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async requestGroup(userId: number, name: string) {
    if (!name?.trim()) {
      throw new BadRequestException('Group name is required');
    }

    const request = await this.prisma.groupRequest.create({
      data: {
        name: name.trim(),
        userId,
      },
    });

    return { message: 'Group request submitted', id: request.id };
  }
}
