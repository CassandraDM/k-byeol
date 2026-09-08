import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AccountService } from './account.service';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuthenticated } from '../common/api-responses';

/**
 * Deleting checks a password, so it is guessable in the way the auth routes
 * are and gets the same tightened budget rather than the default 100/min.
 */
const SENSITIVE = { default: { ttl: 60_000, limit: 10 } };

/**
 * The current user's own account: the two things they can do to it as a whole
 * rather than field by field. Everything here is implicitly scoped to the
 * caller — there is no id in any path, so no route can be pointed at somebody
 * else's account by changing a number.
 */
@Controller('me')
@UseGuards(JwtAuthGuard)
@ApiTags('Account')
@ApiAuthenticated()
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Delete()
  @ApiOperation({ summary: 'Delete the current account' })
  @Throttle(SENSITIVE)
  @HttpCode(HttpStatus.OK)
  // The parameter stays a bare DeleteAccountDto: a union type would erase the
  // design:paramtypes metadata and the global ValidationPipe would wave the
  // body through unvalidated. A DELETE sent with no body at all still reaches
  // the service as undefined — under Express 5 req.body is not defaulted to {}
  // — which is why the service treats the argument as optional.
  deleteAccount(@Req() req: Request, @Body() dto: DeleteAccountDto) {
    const user = req['user'] as { id: number };
    return this.accountService.deleteAccount(user.id, dto);
  }

  /**
   * Served as an attachment rather than a plain JSON body: this is a file the
   * user is meant to keep, and the filename is part of what they get.
   */
  @Get('export')
  @ApiOperation({ summary: 'Download everything the account holds' })
  async exportData(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req['user'] as { id: number };
    const data = await this.accountService.exportData(user.id);

    const day = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="k-byeol-export-${day}.json"`,
    );

    return data;
  }
}
