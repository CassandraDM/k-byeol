import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { MessagesService } from './messages.service';
import { EditMessageDto } from './dto/edit-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * Messages are addressed by their own id: an edit or a delete says nothing
 * about which thread it belongs to, and the service looks that up anyway to
 * decide who is allowed.
 */
@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  /** Rewrites a message. Authors only. */
  @Patch(':id')
  edit(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditMessageDto,
  ) {
    const user = req['user'] as { id: number };
    return this.messages.edit(user.id, id, dto.text);
  }

  /** Removes a message. The author, or somebody who may moderate the thread. */
  @Delete(':id')
  remove(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req['user'] as { id: number };
    return this.messages.remove(user.id, id);
  }

  /** Undoes a deletion. Only whoever deleted it. */
  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  restore(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req['user'] as { id: number };
    return this.messages.restore(user.id, id);
  }
}
