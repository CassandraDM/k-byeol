import { INestApplication, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const logger = new Logger('Swagger');

/** Where the documentation lives. */
const DOCS_PATH = 'api-docs';

/**
 * Mounts the OpenAPI document and its UI — in development only.
 *
 * A spec is a complete map of every route, parameter and error shape. It grants
 * no access on its own, but it removes all the guesswork, and #63 was about not
 * handing out what the API does not need to give away. Issue #77 asks for it
 * behind a credential in production; until that gate actually works, not
 * serving it there at all is the honest version of the same decision — a gate
 * that silently lets everyone through would be worse than this.
 *
 * The attempt is worth recording, because the obvious fixes are the ones that
 * fail: basic-auth middleware never runs against these routes, whether it is
 * registered through `app.use()` (with or without a path) or straight onto the
 * Express instance, and whether it is registered before or after
 * `SwaggerModule.setup`. It is demonstrably installed — helmet, registered by
 * the same call on the same line of the boot sequence, applies its headers to
 * every response — and SwaggerModule still answers first.
 */
export function setupSwagger(app: INestApplication): void {
  if (process.env.NODE_ENV === 'production') {
    logger.log(
      'API documentation is not served in production (see #77 — it needs a ' +
        'credential first).',
    );
    return;
  }

  const config = new DocumentBuilder()
    .setTitle('K-별 API')
    .setDescription(
      'REST API for the K-별 mobile app: accounts, events, chat and ' +
        'moderation.\n\n' +
        'Every route outside `/auth` needs a bearer token — sign in through ' +
        '`POST /auth/login`, then paste the `access_token` into **Authorize**.' +
        '\n\nThe chat itself is not here: it runs over socket.io on this same ' +
        'origin, and OpenAPI has no way to describe WebSocket events.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(DOCS_PATH, app, document, {
    // The token survives a reload, so trying a second route does not mean
    // signing in again.
    swaggerOptions: { persistAuthorization: true },
  });

  logger.log(`API documentation served at /${DOCS_PATH}`);
}
