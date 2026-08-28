import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PreferencesService } from './preferences.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { RequestGroupDto } from './dto/request-group.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request } from 'express';

@Controller('users/me/preferences')
@UseGuards(JwtAuthGuard)
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Get()
  getPreferences(@Req() req: Request) {
    const user = req['user'] as { id: number };
    return this.preferencesService.getPreferences(user.id);
  }

  @Put()
  updatePreferences(@Req() req: Request, @Body() dto: UpdatePreferencesDto) {
    const user = req['user'] as { id: number };
    return this.preferencesService.updatePreferences(user.id, dto);
  }

  @Get('/groups')
  getAllGroups() {
    return this.preferencesService.getAllGroups();
  }

  @Post('/groups/request')
  requestGroup(@Req() req: Request, @Body() dto: RequestGroupDto) {
    const user = req['user'] as { id: number };
    return this.preferencesService.requestGroup(user.id, dto.name);
  }
}
