import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PreferencesModule } from './preferences/preferences.module';
import { EventsModule } from './events/events.module';
import { ConversationsModule } from './conversations/conversations.module';
import { ChatModule } from './chat/chat.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [PrismaModule, AuthModule, PreferencesModule, EventsModule, ConversationsModule, ChatModule, UsersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
