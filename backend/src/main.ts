import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

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

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
