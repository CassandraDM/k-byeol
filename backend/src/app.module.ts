import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PreferencesModule } from './preferences/preferences.module';
import { EventsModule } from './events/events.module';
import { ConversationsModule } from './conversations/conversations.module';
import { ChatModule } from './chat/chat.module';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ModerationModule } from './moderation/moderation.module';
import { FollowsModule } from './follows/follows.module';

@Module({
  imports: [
    // Baseline rate limit for every HTTP route. Endpoints that guard a
    // guessable secret (login, 6-digit codes) tighten it with @Throttle().
    // WebSocket frames are skipped: the guard reads an HTTP request/response
    // pair that doesn't exist in a gateway context.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
      skipIf: (context) => context.getType() !== 'http',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    PreferencesModule,
    EventsModule,
    ConversationsModule,
    ChatModule,
    UsersModule,
    NotificationsModule,
    ModerationModule,
    FollowsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
