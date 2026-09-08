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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuthenticated } from '../common/api-responses';

@Controller('users/me/preferences')
@UseGuards(JwtAuthGuard)
@ApiTags('Preferences')
@ApiAuthenticated()
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Get()
  @ApiOperation({ summary: 'Your city and fandoms' })
  getPreferences(@Req() req: Request) {
    const user = req['user'] as { id: number };
    return this.preferencesService.getPreferences(user.id);
  }

  @Put()
  @ApiOperation({ summary: 'Update your city and fandoms' })
  updatePreferences(@Req() req: Request, @Body() dto: UpdatePreferencesDto) {
    const user = req['user'] as { id: number };
    return this.preferencesService.updatePreferences(user.id, dto);
  }

  @Get('/groups')
  @ApiOperation({ summary: 'Every K-pop group on offer' })
  getAllGroups() {
    return this.preferencesService.getAllGroups();
  }

  @Post('/groups/request')
  @ApiOperation({ summary: 'Ask for a group that is missing' })
  requestGroup(@Req() req: Request, @Body() dto: RequestGroupDto) {
    const user = req['user'] as { id: number };
    return this.preferencesService.requestGroup(user.id, dto.name);
  }
}
