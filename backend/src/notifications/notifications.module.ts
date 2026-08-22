import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EventRemindersService } from './event-reminders.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, EventRemindersService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
