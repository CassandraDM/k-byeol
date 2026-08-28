import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { ModerationModule } from '../moderation/moderation.module';
import { FollowsModule } from '../follows/follows.module';

@Module({
  imports: [ModerationModule, FollowsModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
