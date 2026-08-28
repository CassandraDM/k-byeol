import { Module } from '@nestjs/common';
import { BlocksController, ReportsController } from './moderation.controller';
import { ModerationService } from './moderation.service';

@Module({
  controllers: [ReportsController, BlocksController],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
