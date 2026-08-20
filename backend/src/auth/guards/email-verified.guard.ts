import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Blocks a route unless the authenticated user's email is verified.
 * Must run after JwtAuthGuard (which populates `request.user`).
 */
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authUser = request['user'] as { id: number } | undefined;

    if (!authUser) {
      throw new ForbiddenException('Not authenticated');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: authUser.id },
      select: { emailVerified: true },
    });

    if (!user?.emailVerified) {
      throw new ForbiddenException(
        'Please verify your email before creating events.',
      );
    }

    return true;
  }
}
