import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { AddParticipantsDto } from './dto/add-participants.dto';
import { GetMessagesDto } from './dto/get-messages.dto';
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

  @Post(':id/writers/:userId')
  grantWriter(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) targetUserId: number,
  ) {
    const user = req['user'] as { id: number };
    return this.conversationsService.grantWriter(user.id, id, targetUserId);
  }

  @Delete(':id/writers/:userId')
  revokeWriter(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) targetUserId: number,
  ) {
    const user = req['user'] as { id: number };
    return this.conversationsService.revokeWriter(user.id, id, targetUserId);
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
