import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { DeleteAccountDto } from './dto/delete-account.dto';

/**
 * How long a deleted account stays restorable.
 *
 * The window is not a delay before anything happens — everything the user can
 * observe happens the moment they confirm. It is how long the two columns that
 * make a restore possible survive, which also gives moderation a bounded period
 * in which a report filed against the account can still be acted on.
 */
export const GRACE_PERIOD_DAYS = 30;

/**
 * `.invalid` is reserved by RFC 2606 and resolves nowhere by definition, so a
 * reserved address can never reach a real inbox even by accident.
 */
export const reservedEmailFor = (userId: number) =>
  `deleted+${userId}@k-byeol.invalid`;

/** Reads as an absence in every list that shows a name. */
export const reservedUsernameFor = (userId: number) =>
  `Deleted user #${userId}`;

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Deletes the current account.
   *
   * The row is kept and its identity is emptied, rather than the row being
   * dropped: `messages.sender_id` is not nullable, so destroying the account
   * would take every message it ever sent with it and punch holes in
   * conversations belonging to other people. Keeping the row lets those threads
   * stay readable under a name that identifies nobody.
   *
   * Everything that is the user's alone goes now — the events they organised,
   * their participations, preferences, follows, blocks, devices, pending
   * tokens. The email and username are freed in the same transaction, so the
   * address is available to a new signup immediately.
   */
  async deleteAccount(userId: number, dto?: DeleteAccountDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('Account not found');
    }

    await this.assertOwnership(user, dto);

    const deletedAt = new Date();
    const { email, username } = await this.reserveIdentity(userId);

    await this.prisma.$transaction([
      // Free the identity first, keeping the originals where only the purge
      // sweep can reach them. This is the whole of what a restore undoes.
      this.prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt,
          restoreEmail: user.email,
          restoreUsername: user.username,
          email,
          username,
          avatar: null,
          bio: null,
        },
      }),

      // Their listings. Deleting an event takes its group chat with it, the
      // same as cancelling one does — the thread has nothing left to be about.
      this.prisma.event.deleteMany({ where: { organizerId: userId } }),

      // Everywhere they had signed up to be.
      this.prisma.eventParticipation.deleteMany({ where: { userId } }),
      this.prisma.conversationParticipant.deleteMany({ where: { userId } }),

      // The social graph, cut from both sides.
      this.prisma.follow.deleteMany({
        where: { OR: [{ followerId: userId }, { followingId: userId }] },
      }),
      this.prisma.block.deleteMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      }),

      // Personal data and anything that could still authenticate.
      this.prisma.userPreferences.deleteMany({ where: { userId } }),
      this.prisma.deviceToken.deleteMany({ where: { userId } }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId } }),
      this.prisma.emailVerificationToken.deleteMany({ where: { userId } }),
      this.prisma.groupRequest.deleteMany({ where: { userId } }),
    ]);

    return {
      deletedAt,
      // Reports this account filed are deliberately left standing: they are
      // about someone else's behaviour, and moderation would lose the trail.
      gracePeriodDays: GRACE_PERIOD_DAYS,
      message:
        'Your account has been deleted. You can sign up again with the same ' +
        'email address whenever you like.',
    };
  }

  /**
   * Everything the account holds, as one JSON document.
   *
   * Deliberately assembled from the tables rather than from the API's read
   * models: an export is supposed to show what is stored, not what the app
   * chooses to display.
   */
  async exportData(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        preferences: { include: { groups: { include: { group: true } } } },
      },
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException('Account not found');
    }

    const [
      organizedEvents,
      participations,
      conversations,
      messages,
      following,
      followers,
      blocksMade,
      reports,
      groupRequests,
      deviceTokens,
    ] = await Promise.all([
      this.prisma.event.findMany({
        where: { organizerId: userId },
        orderBy: { date: 'asc' },
      }),
      this.prisma.eventParticipation.findMany({
        where: { userId },
        include: { event: true },
      }),
      this.prisma.conversationParticipant.findMany({
        where: { userId },
        include: { conversation: true },
      }),
      this.prisma.message.findMany({
        where: { senderId: userId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.follow.findMany({
        where: { followerId: userId },
        include: { following: { select: { id: true, username: true } } },
      }),
      this.prisma.follow.findMany({
        where: { followingId: userId },
        include: { follower: { select: { id: true, username: true } } },
      }),
      this.prisma.block.findMany({
        where: { blockerId: userId },
        include: { blocked: { select: { id: true, username: true } } },
      }),
      this.prisma.report.findMany({ where: { reporterId: userId } }),
      this.prisma.groupRequest.findMany({ where: { userId } }),
      this.prisma.deviceToken.findMany({ where: { userId } }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        role: user.role,
        provider: user.provider,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      preferences: user.preferences
        ? {
            city: {
              code: user.preferences.cityCode,
              name: user.preferences.cityName,
              postalCode: user.preferences.cityPostalCode,
            },
            hideBlockedEvents: user.preferences.hideBlockedEvents,
            fandoms: user.preferences.groups.map((g) => ({
              id: g.group.id,
              name: g.group.name,
            })),
          }
        : null,
      events: {
        organized: organizedEvents,
        participating: participations.map((p) => ({
          joinedAt: p.createdAt,
          event: p.event,
        })),
      },
      // The marketplace has no model yet, so there is nothing to list. The key
      // is here rather than absent so the shape does not change under a reader
      // the day it ships.
      listings: [],
      conversations: conversations.map((c) => ({
        id: c.conversationId,
        type: c.conversation.type,
        name: c.conversation.name,
        role: c.role,
        joinedAt: c.joinedAt,
      })),
      messages: messages.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        text: m.text,
        createdAt: m.createdAt,
        editedAt: m.editedAt,
        deletedAt: m.deletedAt,
      })),
      social: {
        following: following.map((f) => ({
          user: f.following,
          since: f.createdAt,
        })),
        followers: followers.map((f) => ({
          user: f.follower,
          since: f.createdAt,
        })),
        blocked: blocksMade.map((b) => ({
          user: b.blocked,
          since: b.createdAt,
        })),
      },
      reportsSubmitted: reports,
      groupRequests,
      devices: deviceTokens.map((d) => ({
        platform: d.platform,
        registeredAt: d.createdAt,
      })),
    };
  }

  /**
   * Confirms the person asking is the account holder. Which proof is accepted
   * follows from the account, not from what the caller chose to send.
   */
  private async assertOwnership(
    user: { email: string; password: string; provider: string },
    // Undefined when the request carried no body at all, which is a perfectly
    // ordinary way to send a DELETE. It means "no proof offered", not a crash.
    dto: DeleteAccountDto | undefined,
  ) {
    if (user.provider === 'email') {
      if (!dto?.password) {
        throw new BadRequestException(
          'Confirm with your password to delete your account.',
        );
      }
      const valid = await bcrypt.compare(dto.password, user.password);
      if (!valid) {
        throw new UnauthorizedException('Incorrect password');
      }
      return;
    }

    if (!dto?.accessToken) {
      throw new BadRequestException(
        `Sign in with ${user.provider} again to confirm deleting your account.`,
      );
    }
    await this.auth.assertSocialIdentity(dto.accessToken, user.email);
  }

  /**
   * Picks the reserved email and username the account will wear once deleted.
   *
   * Both columns are unique and nothing stops a live account from having taken
   * the reserved name already, so a clash falls back to a suffixed form. A
   * deletion must not be the thing that fails.
   */
  private async reserveIdentity(userId: number) {
    let email = reservedEmailFor(userId);
    let username = reservedUsernameFor(userId);

    const clash = await this.prisma.user.findFirst({
      where: {
        id: { not: userId },
        OR: [{ email }, { username }],
      },
      select: { id: true },
    });

    if (clash) {
      const suffix = randomBytes(3).toString('hex');
      email = `deleted+${userId}.${suffix}@k-byeol.invalid`;
      username = `${reservedUsernameFor(userId)} ${suffix}`;
    }

    return { email, username };
  }
}
