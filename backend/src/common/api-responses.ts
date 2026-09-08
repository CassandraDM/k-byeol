import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

/**
 * The failures that belong to the whole API rather than to any one route.
 *
 * They come from the global pipe, the guards and the throttler, so no
 * controller declares them and every controller can return them. Writing them
 * out route by route would be a hundred copies of the same four sentences, and
 * the first one to drift would be the one somebody trusted.
 */

/** Every route behind JwtAuthGuard, which is every route outside `/auth`. */
export const ApiAuthenticated = () =>
  applyDecorators(
    ApiBearerAuth('bearer'),
    ApiUnauthorizedResponse({
      description:
        'The token is missing, expired, malformed, or belongs to an account ' +
        'that has been deleted.',
    }),
  );

/**
 * Every route taking a body. The global ValidationPipe runs with `whitelist`
 * and `forbidNonWhitelisted`, so an unknown property is refused outright
 * rather than quietly dropped — a mass-assignment attempt fails loudly.
 */
export const ApiValidatedBody = () =>
  applyDecorators(
    ApiBadRequestResponse({
      description:
        'A field failed validation, or the body carried a property no DTO ' +
        'declares.',
    }),
  );

/** Routes behind EmailVerifiedGuard — anything that creates public content. */
export const ApiRequiresVerifiedEmail = () =>
  applyDecorators(
    ApiForbiddenResponse({
      description: 'The account has not confirmed its email address yet.',
    }),
  );

/**
 * Routes on the tightened throttle: 10 requests a minute instead of the
 * default 100, because what they check is guessable.
 */
export const ApiRateLimited = () =>
  applyDecorators(
    ApiTooManyRequestsResponse({
      description:
        'Too many attempts. These routes allow 10 per minute, not the usual ' +
        '100.',
    }),
  );
