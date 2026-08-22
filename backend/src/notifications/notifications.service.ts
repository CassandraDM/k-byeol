import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Expo's push gateway — it fans out to APNs / FCM for us. */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo accepts at most 100 messages per request. */
const CHUNK_SIZE = 100;

/**
 * What the app should open when the user taps the notification.
 * Mirrored by `routeForNotification()` in the mobile app.
 */
export type PushData =
  | { type: 'chat'; conversationId: number }
  | { type: 'event'; eventId: number };

export interface PushPayload {
  title: string;
  body: string;
  data: PushData;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Stores per-device Expo push tokens and delivers notifications through the
 * Expo push service.
 *
 * Sending is always best-effort: a failure here must never break the action
 * that triggered it (posting a message, joining an event…), so every public
 * send method swallows and logs its errors rather than throwing.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Stores (or re-points) a device's push token for a user.
   *
   * Tokens are unique per installation, so if the same device is re-used by
   * another account we move the row instead of creating a duplicate.
   */
  async registerToken(userId: number, token: string, platform?: string) {
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform: platform ?? null },
      update: { userId, platform: platform ?? null },
    });
    return { registered: true };
  }

  /** Forgets a device token — called on sign-out. */
  async unregisterToken(userId: number, token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
    return { registered: false };
  }

  /**
   * Sends one notification to every device of every listed user.
   * Silently does nothing when nobody has a registered device.
   */
  async sendToUsers(userIds: number[], payload: PushPayload): Promise<void> {
    const targets = Array.from(new Set(userIds));
    if (targets.length === 0) return;

    try {
      const devices = await this.prisma.deviceToken.findMany({
        where: { userId: { in: targets } },
        select: { token: true },
      });
      if (devices.length === 0) return;

      await this.push(
        devices.map((d) => d.token),
        payload,
      );
    } catch (e) {
      this.logger.error(`Failed to send "${payload.title}" push`, e as Error);
    }
  }

  /**
   * POSTs the messages to Expo in chunks and prunes any token Expo tells us
   * is no longer valid (app uninstalled, permissions revoked…).
   */
  private async push(tokens: string[], payload: PushPayload): Promise<void> {
    const accessToken = process.env.EXPO_ACCESS_TOKEN;

    for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
      const chunk = tokens.slice(i, i + CHUNK_SIZE);
      const messages = chunk.map((to) => ({
        to,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        sound: 'default' as const,
        channelId: 'default',
      }));

      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(messages),
      });

      if (!res.ok) {
        this.logger.error(
          `Expo push rejected the request (${res.status}): ${await res.text()}`,
        );
        continue;
      }

      const body = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = body.data ?? [];
      const dead: string[] = [];

      tickets.forEach((ticket, index) => {
        if (ticket.status !== 'error') return;
        if (ticket.details?.error === 'DeviceNotRegistered') {
          dead.push(chunk[index]);
          return;
        }
        this.logger.warn(
          `Expo push error for ${chunk[index]}: ${ticket.message ?? 'unknown'}`,
        );
      });

      if (dead.length > 0) {
        await this.prisma.deviceToken.deleteMany({
          where: { token: { in: dead } },
        });
        this.logger.log(`Pruned ${dead.length} unregistered device token(s)`);
      }
    }
  }
}
