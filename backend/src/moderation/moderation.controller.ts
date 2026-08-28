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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ModerationService } from './moderation.service';
import { CreateReportDto } from './dto/create-report.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly moderation: ModerationService) {}

  @Post()
  create(@Req() req: Request, @Body() dto: CreateReportDto) {
    const user = req['user'] as { id: number };
    return this.moderation.createReport(user.id, dto);
  }
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class BlocksController {
  constructor(private readonly moderation: ModerationService) {}

  /** The people the current user has blocked. */
  @Get('me/blocks')
  listBlocked(@Req() req: Request) {
    const user = req['user'] as { id: number };
    return this.moderation.listBlocked(user.id);
  }

  @Post(':id/block')
  @HttpCode(HttpStatus.OK)
  block(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req['user'] as { id: number };
    return this.moderation.block(user.id, id);
  }

  /**
   * Not in the original spec, but a block with no way back turns a mis-tap
   * into a permanent, support-only problem.
   */
  @Delete(':id/block')
  @HttpCode(HttpStatus.OK)
  unblock(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req['user'] as { id: number };
    return this.moderation.unblock(user.id, id);
  }
}
