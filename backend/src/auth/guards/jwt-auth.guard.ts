import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { JwtPayload } from '../jwt-payload';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing authorization token');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // A valid signature only proves we issued the token, not that its shape
    // is what we expect — an old token from a previous claim layout would
    // otherwise put `undefined` where every downstream query expects an id.
    if (typeof payload.sub !== 'number') {
      throw new UnauthorizedException('Malformed token payload');
    }

    // Tokens live for seven days and there is no revocation list, so a deleted
    // account would otherwise keep working — able to post, join and message —
    // for up to a week after asking to be gone. One indexed lookup per request
    // is what closes that window; it is the same query the route was about to
    // make anyway.
    const account = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, deletedAt: true },
    });
    if (!account || account.deletedAt) {
      throw new UnauthorizedException('This account no longer exists');
    }

    request['user'] = { id: payload.sub, email: payload.email };

    return true;
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
