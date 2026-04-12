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
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { QueryEventsDto } from './dto/query-events.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request } from 'express';

@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  create(@Req() req: Request, @Body() dto: CreateEventDto) {
    const user = req['user'] as { id: number };
    return this.eventsService.create(user.id, dto);
  }

  @Get()
  findByLocation(@Query() query: QueryEventsDto) {
    return this.eventsService.findByLocation(query.lat, query.lng, query.radius ?? 10);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.findById(id);
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
