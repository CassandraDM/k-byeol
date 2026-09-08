import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { setupSwagger, swaggerDocsGuard, SWAGGER_PATHS } from './swagger';

/**
 * Browser origins allowed to call the API. Native builds aren't subject to
 * CORS, so this only matters for the Expo web build. Comma-separated list in
 * CORS_ORIGINS; when it isn't set we fall back to the local Expo dev servers
 * rather than to `*`, so a deployed API never answers arbitrary origins.
 */
function corsOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (configured?.length) return configured;
  if (process.env.NODE_ENV === 'production') return [];
  return [
    'http://localhost:8081',
    'http://localhost:19006',
    'http://localhost:3000',
  ];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security response headers (nosniff, frameguard, HSTS…). contentSecurityPolicy
  // is off: the API only ever returns JSON, and the default CSP would just add
  // headers no client reads.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Registered here, next to helmet, rather than beside the routes it guards:
  // middleware added later in the boot sequence never gets to run against
  // them, because SwaggerModule has already bound a handler that answers first.
  const docsGuard = swaggerDocsGuard();
  if (docsGuard) {
    for (const path of SWAGGER_PATHS) app.use(path, docsGuard);
  }

  app.enableCors({ origin: corsOrigins(), credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip properties that no DTO declares…
      whitelist: true,
      // …and reject the request outright instead of silently ignoring them,
      // so a mass-assignment attempt fails loudly rather than half-succeeding.
      forbidNonWhitelisted: true,
    }),
  );

  // After the pipes, so the document describes the API as it actually
  // behaves — the validation rules the DTOs declare are part of the contract.
  setupSwagger(app);

  // '::' is what Node binds when no host is given, and on Linux it is
  // dual-stack — IPv6 plus IPv4-mapped addresses. Passing '0.0.0.0' instead
  // narrows the socket to IPv4 only, which a platform routing over IPv6
  // internally (Railway) cannot reach: the health check still passes and the
  // public domain answers "Application failed to respond". Spelled out rather
  // than left implicit so nobody "fixes" it back to 0.0.0.0.
  await app.listen(process.env.PORT ?? 3000, '::');
}
void bootstrap();
