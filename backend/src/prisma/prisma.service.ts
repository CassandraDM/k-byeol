import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import type { ConnectionOptions } from 'tls';

const logger = new Logger('PrismaService');

/**
 * TLS options for the Postgres pool.
 *
 * The managed database only accepts TLS connections, but its chain isn't
 * verifiable against the system trust store without the provider's CA. Rather
 * than turning verification off globally (which would also stop verifying the
 * mail and push providers), we scope the decision to this pool:
 *
 *  - DATABASE_CA_CERT set  → verify against that CA (PEM contents or a path).
 *  - production, no CA     → verify against the system store; fail closed.
 *  - development, no CA    → skip verification, but say so on every boot.
 */
function sslOptions(): ConnectionOptions {
  const ca = process.env.DATABASE_CA_CERT;
  if (ca) {
    const pem = ca.includes('BEGIN CERTIFICATE')
      ? ca
      : readFileSync(ca, 'utf8');
    return { rejectUnauthorized: true, ca: pem };
  }

  if (process.env.NODE_ENV === 'production') {
    return { rejectUnauthorized: true };
  }

  logger.warn(
    'Database TLS certificate verification is DISABLED (development only). ' +
      'Set DATABASE_CA_CERT to the provider CA to enable it.',
  );
  return { rejectUnauthorized: false };
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not set — add it to your .env (see .env.example).',
      );
    }
    const pool = new Pool({ connectionString, ssl: sslOptions() });
    // The adapter ships its own nested copy of @types/pg, so the two Pool
    // types are structurally identical but nominally distinct. The cast is the
    // seam between them, not a real type hole.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const adapter = new PrismaPg(pool as any);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
