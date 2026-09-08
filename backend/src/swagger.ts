import { INestApplication, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import basicAuth from 'express-basic-auth';

const logger = new Logger('Swagger');

/** Where the documentation lives. */
const DOCS_PATH = 'api-docs';

/**
 * Who may read the documentation.
 *
 * A spec is a complete map of every route, parameter and error shape. It grants
 * no access on its own, but it removes all the guesswork, and #63 was about not
 * handing out what the API does not need to give away — so in production it
 * sits behind a credential.
 *
 * With no credential configured the answer differs by environment on purpose:
 * development wants the docs one click away, production fails closed and serves
 * nothing, the same posture JWT_SECRET and DATABASE_CA_CERT already take.
 */
function credentials():
  | { user: string; password: string }
  | 'open'
  | 'disabled' {
  const user = process.env.SWAGGER_USER;
  const password = process.env.SWAGGER_PASSWORD;

  if (user && password) return { user, password };
  return process.env.NODE_ENV === 'production' ? 'disabled' : 'open';
}

/**
 * Mounts the OpenAPI document and its UI — in development only.
 *
 * Guarded rather than public: a spec is a complete map of every route,
 * parameter and error shape, and #63 was about not handing out what the API
 * does not need to give away.
 */
export function swaggerDocsGuard() {
  const access = credentials();
  if (access === 'open' || access === 'disabled') return null;

  return basicAuth({
    users: { [access.user]: access.password },
    challenge: true,
    // ASCII only: the realm is echoed in a WWW-Authenticate header, and header
    // values are latin-1. The 별 in the app's name throws ERR_INVALID_CHAR
    // there, which turns every refusal into a 500.
    realm: 'K-byeol API documentation',
  });
}

/** Every path SwaggerModule answers on, including what it serves beneath. */
export const SWAGGER_PATHS = [
  `/${DOCS_PATH}`,
  `/${DOCS_PATH}/*splat`,
  `/${DOCS_PATH}-json`,
  `/${DOCS_PATH}-yaml`,
];

export function setupSwagger(app: INestApplication): void {
  const access = credentials();

  if (access === 'disabled') {
    logger.warn(
      'API documentation is not being served: set SWAGGER_USER and ' +
        'SWAGGER_PASSWORD to publish it behind a credential.',
    );
    return;
  }

  if (access === 'open') {
    logger.warn(
      `API documentation is open at /${DOCS_PATH} (development only).`,
    );
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
