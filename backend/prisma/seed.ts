import { PrismaClient, EventType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';

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

const SEED_EVENTS = [
  // Paris (48.8566, 2.3522)
  {
    title: 'Random Play Dance at Trocadéro',
    type: EventType.RANDOM_PLAY_DANCE,
    latitude: 48.8620,
    longitude: 2.2885,
    address: 'Place du Trocadéro, 75016 Paris',
    date: '2026-05-10',
    time: '14:00',
    description: 'Join us for a massive Random Play Dance in front of the Eiffel Tower! All levels welcome.',
  },
  {
    title: 'K-pop Festival Paris 2026',
    type: EventType.FESTIVAL,
    latitude: 48.8396,
    longitude: 2.3786,
    address: 'AccorHotels Arena, 8 Bd de Bercy, 75012 Paris',
    date: '2026-06-15',
    time: '18:00',
    description: 'The biggest K-pop festival in France with performances from top groups.',
  },
  {
    title: 'BTS Dance Cover On Stage',
    type: EventType.ON_STAGE,
    latitude: 48.8606,
    longitude: 2.3376,
    address: 'Jardin des Tuileries, 75001 Paris',
    date: '2026-05-20',
    time: '16:00',
    description: 'Watch amazing BTS dance cover performances live on stage!',
  },
  {
    title: 'K-pop Flash Mob at Châtelet',
    type: EventType.IN_PUBLIC,
    latitude: 48.8580,
    longitude: 2.3470,
    address: 'Place du Châtelet, 75001 Paris',
    date: '2026-05-25',
    time: '15:00',
    description: 'Surprise the public with our coordinated K-pop flash mob!',
  },
  {
    title: 'NewJeans RPD Montmartre',
    type: EventType.RANDOM_PLAY_DANCE,
    latitude: 48.8867,
    longitude: 2.3431,
    address: 'Place du Tertre, 75018 Paris',
    date: '2026-06-01',
    time: '13:00',
    description: 'Random Play Dance featuring NewJeans hits on the streets of Montmartre.',
  },
  // Lyon (45.7640, 4.8357)
  {
    title: 'Lyon K-pop Night Festival',
    type: EventType.FESTIVAL,
    latitude: 45.7676,
    longitude: 4.8344,
    address: 'Place Bellecour, 69002 Lyon',
    date: '2026-05-17',
    time: '19:00',
    description: 'A night dedicated to K-pop music and performances in the heart of Lyon.',
  },
  {
    title: 'RPD at Parc de la Tête d\'Or',
    type: EventType.RANDOM_PLAY_DANCE,
    latitude: 45.7772,
    longitude: 4.8558,
    address: 'Parc de la Tête d\'Or, 69006 Lyon',
    date: '2026-06-08',
    time: '14:30',
    description: 'Random Play Dance in Lyon\'s most beautiful park. Bring your energy!',
  },
  {
    title: 'ATEEZ Cover Stage Lyon',
    type: EventType.ON_STAGE,
    latitude: 45.7580,
    longitude: 4.8320,
    address: 'Place des Terreaux, 69001 Lyon',
    date: '2026-05-30',
    time: '17:00',
    description: 'Live cover performances of ATEEZ choreographies on stage.',
  },
  {
    title: 'K-pop Dance in Public Lyon',
    type: EventType.IN_PUBLIC,
    latitude: 45.7630,
    longitude: 4.8400,
    address: 'Rue de la République, 69002 Lyon',
    date: '2026-06-05',
    time: '15:00',
    description: 'Dance to your favorite K-pop songs in the busiest street of Lyon!',
  },
  // Marseille (43.2965, 5.3698)
  {
    title: 'Marseille Beach RPD',
    type: EventType.RANDOM_PLAY_DANCE,
    latitude: 43.2821,
    longitude: 5.3757,
    address: 'Plage des Catalans, 13007 Marseille',
    date: '2026-06-20',
    time: '11:00',
    description: 'Random Play Dance on the beach! Come dance with us by the sea.',
  },
  {
    title: 'K-pop Showcase Vieux-Port',
    type: EventType.ON_STAGE,
    latitude: 43.2951,
    longitude: 5.3739,
    address: 'Quai du Port, 13002 Marseille',
    date: '2026-06-12',
    time: '18:30',
    description: 'Live K-pop dance showcase at the Old Port of Marseille.',
  },
  {
    title: 'BLACKPINK Flash Mob Marseille',
    type: EventType.IN_PUBLIC,
    latitude: 43.2985,
    longitude: 5.3810,
    address: 'La Canebière, 13001 Marseille',
    date: '2026-05-28',
    time: '16:00',
    description: 'Surprise flash mob performing BLACKPINK hits on La Canebière!',
  },
  // Toulouse (43.6047, 1.4442)
  {
    title: 'Toulouse K-pop Fest',
    type: EventType.FESTIVAL,
    latitude: 43.6045,
    longitude: 1.4440,
    address: 'Place du Capitole, 31000 Toulouse',
    date: '2026-06-22',
    time: '17:00',
    description: 'Annual K-pop festival at the iconic Place du Capitole.',
  },
  {
    title: 'Stray Kids RPD Toulouse',
    type: EventType.RANDOM_PLAY_DANCE,
    latitude: 43.6008,
    longitude: 1.4430,
    address: 'Quai de la Daurade, 31000 Toulouse',
    date: '2026-05-18',
    time: '14:00',
    description: 'Random Play Dance featuring Stray Kids songs along the Garonne river.',
  },
  // Bordeaux (44.8378, -0.5792)
  {
    title: 'Bordeaux K-pop in Public',
    type: EventType.IN_PUBLIC,
    latitude: 44.8414,
    longitude: -0.5694,
    address: 'Place de la Bourse, 33000 Bordeaux',
    date: '2026-06-10',
    time: '15:30',
    description: 'Dance K-pop in public at the stunning Miroir d\'Eau!',
  },
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

  // Seed K-pop groups
  console.log('Seeding K-pop groups...');
  for (const group of KPOP_GROUPS) {
    await prisma.kpopGroup.upsert({
      where: { slug: group.slug },
      update: { name: group.name },
      create: group,
    });
  }
  console.log(`Seeded ${KPOP_GROUPS.length} K-pop groups.`);

  // Seed organizer user
  console.log('Seeding event organizer...');
  const hashedPassword = await bcrypt.hash('SeedPassword123!', 10);
  const organizer = await prisma.user.upsert({
    where: { email: 'seed@kbyeol.dev' },
    update: {},
    create: {
      username: 'kbyeol-events',
      email: 'seed@kbyeol.dev',
      password: hashedPassword,
      role: 'organizer',
    },
  });
  console.log(`Seed organizer: id=${organizer.id}`);

  // Seed events
  console.log('Seeding events...');
  for (const event of SEED_EVENTS) {
    const existing = await prisma.event.findFirst({
      where: {
        title: event.title,
        organizerId: organizer.id,
      },
    });

    if (existing) {
      await prisma.event.update({
        where: { id: existing.id },
        data: {
          ...event,
          date: new Date(event.date),
        },
      });
    } else {
      await prisma.event.create({
        data: {
          ...event,
          date: new Date(event.date),
          organizerId: organizer.id,
        },
      });
    }
  }
  console.log(`Seeded ${SEED_EVENTS.length} events.`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
