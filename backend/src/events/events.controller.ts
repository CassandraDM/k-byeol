import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { QueryEventsDto } from './dto/query-events.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import type { Request } from 'express';

@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @UseGuards(EmailVerifiedGuard)
  create(@Req() req: Request, @Body() dto: CreateEventDto) {
    const user = req['user'] as { id: number };
    return this.eventsService.create(user.id, dto);
  }

  @Get()
  findByLocation(@Req() req: Request, @Query() query: QueryEventsDto) {
    const user = req['user'] as { id: number };
    return this.eventsService.findByLocation(query.lat, query.lng, query.radius ?? 10, user.id);
  }

  @Get(':id')
  findById(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req['user'] as { id: number };
    return this.eventsService.findById(id, user.id);
  }

  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateEventDto>,
  ) {
    const user = req['user'] as { id: number };
    return this.eventsService.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const user = req['user'] as { id: number };
    return this.eventsService.remove(user.id, id);
  }

  @Post(':id/participate')
  participate(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const user = req['user'] as { id: number };
    return this.eventsService.participate(user.id, id);
  }

  @Delete(':id/participate')
  cancelParticipation(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const user = req['user'] as { id: number };
    return this.eventsService.cancelParticipation(user.id, id);
  }
}
