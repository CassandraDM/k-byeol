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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuthenticated } from '../common/api-responses';

/**
 * Messages are addressed by their own id: an edit or a delete says nothing
 * about which thread it belongs to, and the service looks that up anyway to
 * decide who is allowed.
 */
@Controller('messages')
@UseGuards(JwtAuthGuard)
@ApiTags('Messages')
@ApiAuthenticated()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  /** Rewrites a message. Authors only. */
  @Patch(':id')
  @ApiOperation({ summary: 'Rewrite your own message' })
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
  @ApiOperation({ summary: 'Delete a message' })
  remove(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req['user'] as { id: number };
    return this.messages.remove(user.id, id);
  }

  /** Undoes a deletion. Only whoever deleted it. */
  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore a message you just deleted' })
  @HttpCode(HttpStatus.OK)
  restore(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req['user'] as { id: number };
    return this.messages.restore(user.id, id);
  }
}
