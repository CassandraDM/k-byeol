import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ModerationModule } from '../moderation/moderation.module';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [NotificationsModule, ModerationModule, ConversationsModule],
  providers: [ChatGateway, ChatService],
})
export class ChatModule {}
