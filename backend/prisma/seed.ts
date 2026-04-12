import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const KPOP_GROUPS = [
  { name: 'BTS', slug: 'bts' },
  { name: 'BLACKPINK', slug: 'blackpink' },
  { name: 'Stray Kids', slug: 'skz' },
  { name: 'TXT', slug: 'txt' },
  { name: 'SEVENTEEN', slug: 'seventeen' },
  { name: 'aespa', slug: 'aespa' },
  { name: 'TWICE', slug: 'twice' },
  { name: 'EXO', slug: 'exo' },
  { name: 'Red Velvet', slug: 'red-velvet' },
  { name: 'ITZY', slug: 'itzy' },
  { name: 'LE SSERAFIM', slug: 'le-sserafim' },
  { name: 'NewJeans', slug: 'newjeans' },
  { name: 'IVE', slug: 'ive' },
  { name: 'NCT', slug: 'nct' },
  { name: 'GOT7', slug: 'got7' },
  { name: 'ENHYPEN', slug: 'enhypen' },
  { name: 'ATEEZ', slug: 'ateez' },
  { name: 'i-dle', slug: 'i-dle' },
  { name: 'MONSTA X', slug: 'monsta-x' },
  { name: 'SHINee', slug: 'shinee' },
];

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'aws-1-eu-west-3.pooler.supabase.com',
    port: Number(process.env.DB_PORT) || 6543,
    user: process.env.DB_USER || 'postgres.jictcppytorltywhnmjf',
    password: process.env.DB_PASSWORD || 'Chickenhasmeat1509!',
    database: process.env.DB_NAME || 'postgres',
    ssl: { rejectUnauthorized: false },
  });

  const adapter = new PrismaPg(pool as any);
  const prisma = new PrismaClient({ adapter });

  console.log('Seeding K-pop groups...');

  for (const group of KPOP_GROUPS) {
    await prisma.kpopGroup.upsert({
      where: { slug: group.slug },
      update: { name: group.name },
      create: group,
    });
  }

  console.log(`Seeded ${KPOP_GROUPS.length} K-pop groups.`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
