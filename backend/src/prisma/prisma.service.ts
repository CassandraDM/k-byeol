import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const pool = new Pool({
      host: 'aws-1-eu-west-3.pooler.supabase.com',
      port: 6543,
      user: 'postgres.jictcppytorltywhnmjf',
      password: 'Chickenhasmeat1509!',
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
    });
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
