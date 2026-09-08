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
import { UpdateEventDto } from './dto/update-event.dto';
import { QueryEventsDto } from './dto/query-events.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuthenticated } from '../common/api-responses';

/** How far around the user we look when the client doesn't say. */
const DEFAULT_RADIUS_KM = 10;

@Controller('events')
@UseGuards(JwtAuthGuard)
@ApiTags('Events')
@ApiAuthenticated()
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an event' })
  @UseGuards(EmailVerifiedGuard)
  create(@Req() req: Request, @Body() dto: CreateEventDto) {
    const user = req['user'] as { id: number };
    return this.eventsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Events near a point, with optional filters' })
  findByLocation(@Req() req: Request, @Query() query: QueryEventsDto) {
    const user = req['user'] as { id: number };
    return this.eventsService.findByLocation(user.id, {
      lat: query.lat,
      lng: query.lng,
      // Explicitly reject NaN: it would reach the SQL comparison and quietly
      // match zero events instead of falling back to the default.
      radiusKm:
        [query.radiusKm, query.radius].find((v) => Number.isFinite(v)) ??
        DEFAULT_RADIUS_KM,
      q: query.q?.trim() || undefined,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'One event in full' })
  findById(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req['user'] as { id: number };
    return this.eventsService.findById(id, user.id);
  }

  @Get(':id/participants')
  @ApiOperation({ summary: 'Who is going' })
  findParticipants(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req['user'] as { id: number };
    return this.eventsService.findParticipants(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an event you organise' })
  update(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEventDto,
  ) {
    const user = req['user'] as { id: number };
    return this.eventsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel an event you organise' })
  remove(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req['user'] as { id: number };
    return this.eventsService.remove(user.id, id);
  }

  @Post(':id/participate')
  @ApiOperation({ summary: 'Join an event' })
  participate(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req['user'] as { id: number };
    return this.eventsService.participate(user.id, id);
  }

  @Delete(':id/participate')
  @ApiOperation({ summary: 'Leave an event' })
  cancelParticipation(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const user = req['user'] as { id: number };
    return this.eventsService.cancelParticipation(user.id, id);
  }
}
