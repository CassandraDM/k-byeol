import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { AddParticipantsDto } from './dto/add-participants.dto';
import { GetMessagesDto } from './dto/get-messages.dto';
import { SetRoleDto } from './dto/set-role.dto';
import { MuteParticipantDto } from './dto/mute-participant.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request } from 'express';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  create(@Req() req: Request, @Body() dto: CreateConversationDto) {
    const user = req['user'] as { id: number };
    return this.conversationsService.create(user.id, dto);
  }

  @Get()
  findAll(@Req() req: Request) {
    const user = req['user'] as { id: number };
    return this.conversationsService.findAll(user.id);
  }

  @Post(':id/participants')
  addParticipants(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddParticipantsDto,
  ) {
    const user = req['user'] as { id: number };
    return this.conversationsService.addParticipants(user.id, id, dto.userIds);
  }

  @Post(':id/join')
  joinCrew(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req['user'] as { id: number };
    return this.conversationsService.joinCrew(user.id, id);
  }

  /**
   * Sets a participant's role. Replaces the old `writers` grant/revoke pair,
   * which could only express two of the three assignable roles.
   */
  @Put(':id/participants/:userId/role')
  setRole(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) targetUserId: number,
    @Body() dto: SetRoleDto,
  ) {
    const user = req['user'] as { id: number };
    return this.conversationsService.setParticipantRole(
      user.id,
      id,
      targetUserId,
      dto.role,
    );
  }

  /**
   * Silences somebody without changing their role. A body of `{ minutes }`
   * times the mute; an empty body makes it permanent.
   */
  @Post(':id/participants/:userId/mute')
  @HttpCode(HttpStatus.OK)
  mute(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) targetUserId: number,
    @Body() dto: MuteParticipantDto,
  ) {
    const user = req['user'] as { id: number };
    return this.conversationsService.muteParticipant(
      user.id,
      id,
      targetUserId,
      dto.minutes,
    );
  }

  @Delete(':id/participants/:userId/mute')
  unmute(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) targetUserId: number,
  ) {
    const user = req['user'] as { id: number };
    return this.conversationsService.unmuteParticipant(
      user.id,
      id,
      targetUserId,
    );
  }

  /**
   * Removes somebody from an organizer-controlled thread. Chat only — their
   * place at the event itself is untouched.
   */
  @Delete(':id/participants/:userId')
  removeParticipant(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) targetUserId: number,
  ) {
    const user = req['user'] as { id: number };
    return this.conversationsService.removeParticipant(
      user.id,
      id,
      targetUserId,
    );
  }

  @Get(':id/messages')
  getMessages(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: GetMessagesDto,
  ) {
    const user = req['user'] as { id: number };
    return this.conversationsService.getMessages(
      user.id,
      id,
      query.before,
      query.limit ?? 20,
    );
  }
}
