import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { FollowsService } from './follows.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuthenticated } from '../common/api-responses';

/**
 * Follows live under `/users` alongside blocks, so "a collection belonging to
 * the signed-in user" keeps the `/users/me/...` shape the API already uses for
 * `/users/me/blocks` and `/users/me/preferences`.
 *
 * The three-segment `me/...` routes can't collide with `:id` (two segments),
 * so their order relative to `UsersController` doesn't matter.
 */
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiTags('Follows')
@ApiAuthenticated()
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  /**
   * The people the current user follows.
   *
   * Answers with the bare list rather than the `{ count, … }` envelope the
   * `:id` routes use — this is the shape the app has been reading since the
   * feature landed, and the length is the count.
   */
  @Get('me/following')
  @ApiOperation({ summary: 'Who you follow' })
  async listOwnFollowing(@Req() req: Request) {
    const user = req['user'] as { id: number };
    const { following } = await this.follows.listFollowing(user.id, user.id);
    return following;
  }

  @Post(':id/follow')
  @ApiOperation({ summary: 'Follow a user' })
  @HttpCode(HttpStatus.OK)
  follow(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req['user'] as { id: number };
    return this.follows.follow(user.id, id);
  }

  @Delete(':id/follow')
  @ApiOperation({ summary: 'Unfollow a user' })
  @HttpCode(HttpStatus.OK)
  unfollow(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req['user'] as { id: number };
    return this.follows.unfollow(user.id, id);
  }

  /** Follower count plus the list — profiles are public to signed-in users. */
  @Get(':id/followers')
  @ApiOperation({ summary: 'The followers of a profile' })
  listFollowers(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req['user'] as { id: number };
    return this.follows.listFollowers(id, user.id);
  }

  /** Who this profile follows. Same visibility rules as its followers. */
  @Get(':id/following')
  @ApiOperation({ summary: 'Who a profile follows' })
  listFollowing(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req['user'] as { id: number };
    return this.follows.listFollowing(id, user.id);
  }
}
