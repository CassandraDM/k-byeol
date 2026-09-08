import 'dotenv/config';
import { PrismaClient, EventType, ConversationType, User, Event } from '@prisma/client';
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

const SEED_USERS = [
  { username: 'Beeko',  email: 'beeko@kbyeol.dev',  bio: 'Random Play Dance lover 💃' },
  { username: 'Neeko',  email: 'neeko@kbyeol.dev',  bio: 'K-pop dancer from Bordeaux' },
  { username: 'Liㄱ',    email: 'lig@kbyeol.dev',    bio: 'Freestyle challenge lead' },
  { username: 'Mimi',   email: 'mimi@kbyeol.dev',   bio: 'ATEEZ 4ever' },
  { username: 'Yuna',   email: 'yuna@kbyeol.dev',   bio: 'ITZY dance cover' },
  { username: 'Hana',   email: 'hana@kbyeol.dev',   bio: 'Festival photographer' },
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
  {
    title: 'Random Play Dance Bordeaux',
    type: EventType.RANDOM_PLAY_DANCE,
    latitude: 44.8412,
    longitude: -0.5740,
    address: 'Place des Quinconces, 33000 Bordeaux',
    date: '2026-05-23',
    time: '14:00',
    description: 'Massive RPD at Place des Quinconces! K-pop hits from all generations.',
  },
  {
    title: 'K-pop Festival Bordeaux',
    type: EventType.FESTIVAL,
    latitude: 44.8295,
    longitude: -0.5705,
    address: 'Parc des Expositions, Bordeaux Lac, 33000 Bordeaux',
    date: '2026-07-04',
    time: '16:00',
    description: 'First edition of the Bordeaux K-pop Festival with dance battles and live performances.',
  },
  {
    title: 'ITZY Cover Stage at Jardin Public',
    type: EventType.ON_STAGE,
    latitude: 44.8458,
    longitude: -0.5793,
    address: 'Jardin Public, 33000 Bordeaux',
    date: '2026-06-14',
    time: '17:00',
    description: 'ITZY choreographies performed live on stage at the Jardin Public.',
  },
  {
    title: 'Stray Kids Freestyle Challenge',
    type: EventType.IN_PUBLIC,
    latitude: 44.8378,
    longitude: -0.5750,
    address: 'Rue Sainte-Catherine, 33000 Bordeaux',
    date: '2026-05-31',
    time: '15:00',
    description: 'Stray Kids freestyle challenge on the longest shopping street in Europe!',
  },
  {
    title: 'NewJeans RPD at Chartrons',
    type: EventType.RANDOM_PLAY_DANCE,
    latitude: 44.8530,
    longitude: -0.5695,
    address: 'Place du Marché des Chartrons, 33000 Bordeaux',
    date: '2026-06-27',
    time: '14:30',
    description: 'Random Play Dance featuring NewJeans hits in the Chartrons district.',
  },
  {
    title: 'BTS Army Meetup Bordeaux',
    type: EventType.IN_PUBLIC,
    latitude: 44.8411,
    longitude: -0.5809,
    address: 'Miroir d\'Eau, 33000 Bordeaux',
    date: '2026-06-07',
    time: '16:00',
    description: 'ARMY gathering with dance covers, purple balloons and lots of love 💜',
  },
];

/**
 * Conversations for the Bordeaux events, keyed by event title.
 *
 * Every event opens a group chat of its own (#43), but the seed writes events
 * straight to the database rather than through the service that opens them, so
 * without this the demo would show a map full of events whose chats are all
 * empty.
 *
 * `from` is a seeded username, or "organizer". Only the organizer and whoever
 * they have given write access can post in an event chat, so everyone who
 * speaks below is made a WRITER — which is also what puts the role system on
 * screen.
 */
const BORDEAUX_EVENT_CHATS: Record<
  string,
  Array<{ from: string; text: string; minutesAgo: number }>
> = {
  'Random Play Dance Bordeaux': [
    { from: 'organizer', text: 'Salut tout le monde ! On se retrouve samedi Place des Quinconces 🎶', minutesAgo: 2880 },
    { from: 'organizer', text: 'Rendez-vous à 14h devant la fontaine, on commence à 14h30 pile.',    minutesAgo: 2875 },
    { from: 'Neeko',     text: "Est-ce qu'il y aura une enceinte ou on prend la nôtre ?",            minutesAgo: 1440 },
    { from: 'organizer', text: "Enceinte fournie ! Ramenez juste de l'eau, il va faire chaud ☀️",    minutesAgo: 1430 },
    { from: 'Beeko',     text: "La playlist est dispo quelque part ? J'aimerais réviser les chorés 💃", minutesAgo: 300 },
    { from: 'organizer', text: 'Je la partage jeudi soir. 2nd → 5th gen, il y en aura pour tout le monde 🔥', minutesAgo: 295 },
    { from: 'Yuna',      text: 'Trop hâte !! On sera 4 de Talence',                                   minutesAgo: 90 },
  ],
  'BTS Army Meetup Bordeaux': [
    { from: 'organizer', text: "ARMY de Bordeaux, on se retrouve au Miroir d'Eau 💜",       minutesAgo: 4320 },
    { from: 'Mimi',      text: 'Je ramène les ballons violets !',                            minutesAgo: 4200 },
    { from: 'organizer', text: 'Parfait 🙏 Prévoyez aussi vos lightsticks si vous en avez.', minutesAgo: 4100 },
    { from: 'Mimi',      text: 'On fait Dynamite et Butter en cover ?',                      minutesAgo: 720 },
    { from: 'organizer', text: 'Oui, plus un freestyle à la fin pour ceux qui veulent 😄',   minutesAgo: 700 },
    { from: 'Hana',      text: 'Je viens avec mon appareil, je vous prends en photo 📸',     minutesAgo: 180 },
  ],
  'Stray Kids Freestyle Challenge': [
    { from: 'organizer', text: 'Challenge freestyle rue Sainte-Catherine ! Format : 1 min par personne.', minutesAgo: 5760 },
    { from: 'Liㄱ',      text: "Je m'occupe du jury avec deux potes danseurs 👀",                        minutesAgo: 5700 },
    { from: 'organizer', text: "Nickel. On garde MANIAC et God's Menu dans la sélection.",                minutesAgo: 5600 },
    { from: 'Liㄱ',      text: 'Petit rappel : on danse sur le côté, faut laisser passer les gens 🙏',    minutesAgo: 600 },
    { from: 'Beeko',     text: 'Noté ! Il reste des places pour participer ?',                            minutesAgo: 240 },
    { from: 'organizer', text: 'Toujours, inscription sur place le jour même 🙂',                         minutesAgo: 230 },
  ],
  'K-pop Festival Bordeaux': [
    { from: 'organizer', text: 'Première édition du festival au Parc des Expositions 🎉',                minutesAgo: 10080 },
    { from: 'organizer', text: 'Au programme : battles de danse, scène ouverte et stands de merch.',      minutesAgo: 10070 },
    { from: 'Hana',      text: "Je couvre l'événement en photo, dites-moi si vous voulez un shooting !",  minutesAgo: 8000 },
    { from: 'organizer', text: 'Avec plaisir 🙌 On te réserve un créneau en backstage.',                  minutesAgo: 7900 },
    { from: 'Yuna',      text: 'Les inscriptions aux battles ouvrent quand ?',                            minutesAgo: 1200 },
    { from: 'organizer', text: "Deux semaines avant, je préviens ici en premier 📣",                      minutesAgo: 1150 },
  ],
  'ITZY Cover Stage at Jardin Public': [
    { from: 'organizer', text: 'Scène ITZY au Jardin Public, on répète WANNABE et LOCO 💫',    minutesAgo: 4000 },
    { from: 'Yuna',      text: "Je prends la partie de Yeji si personne ne l'a prise !",        minutesAgo: 3900 },
    { from: 'organizer', text: 'Elle est à toi 😄',                                            minutesAgo: 3880 },
    { from: 'Yuna',      text: 'Répétition générale la veille à 18h, tout le monde est dispo ?', minutesAgo: 400 },
    { from: 'Mimi',      text: 'Présente !',                                                    minutesAgo: 380 },
  ],
  'NewJeans RPD at Chartrons': [
    { from: 'organizer', text: 'RPD spécial NewJeans au marché des Chartrons 🐰',                minutesAgo: 6000 },
    { from: 'Beeko',     text: 'Ditto, Hype Boy, OMG… on part sur les classiques ?',              minutesAgo: 5900 },
    { from: 'organizer', text: 'Exactement, plus deux surprises 👀',                              minutesAgo: 5850 },
    { from: 'Neeko',     text: 'Le sol est pavé là-bas, prévoyez de bonnes chaussures 😅',        minutesAgo: 500 },
  ],
  'Bordeaux K-pop in Public': [
    { from: 'organizer', text: "On danse au Miroir d'Eau ! Attention, le sol est glissant quand il est mouillé.", minutesAgo: 3000 },
    { from: 'Neeko',     text: "On se met plutôt côté Place de la Bourse alors, c'est plus sec.",                 minutesAgo: 2900 },
    { from: 'organizer', text: 'Bonne idée, on fera comme ça 👍',                                                 minutesAgo: 2880 },
    { from: 'Hana',      text: 'Quelqu\'un a le lien de la choré de la dernière fois ?',                          minutesAgo: 150 },
  ],
};

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set — add it to your .env (see .env.example).',
    );
  }
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const adapter = new PrismaPg(pool as any);
  const prisma = new PrismaClient({ adapter });

  // ─── K-pop groups ──────────────────────────────────────────────────────
  console.log('Seeding K-pop groups...');
  for (const group of KPOP_GROUPS) {
    await prisma.kpopGroup.upsert({
      where: { slug: group.slug },
      update: { name: group.name },
      create: group,
    });
  }
  console.log(`Seeded ${KPOP_GROUPS.length} K-pop groups.`);

  // ─── Organizer user ────────────────────────────────────────────────────
  console.log('Seeding event organizer...');
  const hashedPassword = await bcrypt.hash('SeedPassword123!', 10);
  const organizer = await prisma.user.upsert({
    where: { email: 'seed@kbyeol.dev' },
    update: { emailVerified: true },
    create: {
      username: 'kbyeol-events',
      email: 'seed@kbyeol.dev',
      password: hashedPassword,
      role: 'organizer',
      emailVerified: true,
    },
  });
  console.log(`Seed organizer: id=${organizer.id}`);

  // ─── Additional users ──────────────────────────────────────────────────
  console.log('Seeding users...');
  const seedUsers: User[] = [];
  for (const u of SEED_USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { bio: u.bio, emailVerified: true },
      create: {
        username: u.username,
        email: u.email,
        password: hashedPassword,
        bio: u.bio,
        emailVerified: true,
      },
    });
    seedUsers.push(user);
  }
  console.log(`Seeded ${seedUsers.length} additional users.`);

  // ─── Events ────────────────────────────────────────────────────────────
  console.log('Seeding events...');
  const seededEvents: Event[] = [];
  for (const event of SEED_EVENTS) {
    const existing = await prisma.event.findFirst({
      where: { title: event.title, organizerId: organizer.id },
    });
    if (existing) {
      const updated = await prisma.event.update({
        where: { id: existing.id },
        data: { ...event, date: new Date(event.date) },
      });
      seededEvents.push(updated);
    } else {
      const created = await prisma.event.create({
        data: {
          ...event,
          date: new Date(event.date),
          organizerId: organizer.id,
        },
      });
      seededEvents.push(created);
    }
  }
  console.log(`Seeded ${seededEvents.length} events.`);

  // ─── Event participations ──────────────────────────────────────────────
  console.log('Seeding event participations...');
  let participationCount = 0;
  for (const event of seededEvents) {
    // Random participants: 2-4 from seedUsers
    const shuffled = [...seedUsers].sort(() => Math.random() - 0.5);
    const participantsCount = 2 + Math.floor(Math.random() * 3); // 2..4
    const participants = shuffled.slice(0, participantsCount);

    for (const p of participants) {
      const existing = await prisma.eventParticipation.findUnique({
        where: { userId_eventId: { userId: p.id, eventId: event.id } },
      });
      if (!existing) {
        await prisma.eventParticipation.create({
          data: { userId: p.id, eventId: event.id },
        });
        participationCount++;
      }
    }
  }
  console.log(`Seeded ${participationCount} event participations.`);

  // ─── Follows ───────────────────────────────────────────────────────────
  // Everybody follows the organiser, so a seeded account always has somebody
  // to hear from. On top of that, the first three users follow each other in
  // a ring and the first two follow back — that pair is the "friends" case.
  console.log('Seeding follows...');
  const follows: Array<[number, number]> = [];
  for (const u of seedUsers) follows.push([u.id, organizer.id]);
  for (let i = 0; i < 3 && i < seedUsers.length; i++) {
    const next = seedUsers[(i + 1) % Math.min(3, seedUsers.length)];
    if (next.id !== seedUsers[i].id) follows.push([seedUsers[i].id, next.id]);
  }
  if (seedUsers.length >= 2) {
    follows.push([seedUsers[1].id, seedUsers[0].id]); // mutual → friends
  }

  for (const [followerId, followingId] of follows) {
    await prisma.follow.upsert({
      where: { followerId_followingId: { followerId, followingId } },
      create: { followerId, followingId },
      update: {},
    });
  }
  console.log(`Seeded ${follows.length} follows.`);

  // ─── Conversations & messages ──────────────────────────────────────────
  console.log('Seeding conversations and messages...');
  let convCount = 0;
  let msgCount = 0;

  // Helper to create a PRIVATE conversation between 2 users with messages
  async function seedPrivateConversation(
    userA: { id: number; username: string },
    userB: { id: number; username: string },
    messages: Array<{ from: number; text: string; minutesAgo: number }>,
  ) {
    // Check if already exists
    const candidates = await prisma.conversation.findMany({
      where: {
        type: ConversationType.PRIVATE,
        AND: [
          { participants: { some: { userId: userA.id } } },
          { participants: { some: { userId: userB.id } } },
        ],
      },
      include: { _count: { select: { participants: true } } },
    });
    const existing = candidates.find((c) => c._count.participants === 2);
    if (existing) return;

    const conv = await prisma.conversation.create({
      data: {
        type: ConversationType.PRIVATE,
        participants: {
          create: [
            { userId: userA.id, role: 'MEMBER' },
            { userId: userB.id, role: 'MEMBER' },
          ],
        },
      },
    });
    convCount++;

    let lastMessage: { text: string; createdAt: Date } | null = null;
    for (const m of messages) {
      const createdAt = new Date(Date.now() - m.minutesAgo * 60_000);
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          senderId: m.from,
          text: m.text,
          createdAt,
        },
      });
      lastMessage = { text: m.text, createdAt };
      msgCount++;
    }

    if (lastMessage) {
      await prisma.conversation.update({
        where: { id: conv.id },
        data: {
          lastMessageText: lastMessage.text,
          lastMessageAt: lastMessage.createdAt,
        },
      });
    }
  }

  // Helper for GROUP/CREW conversation with many users
  async function seedGroupConversation(
    name: string,
    type: ConversationType,
    owner: { id: number },
    members: Array<{ id: number }>,
    messages: Array<{ from: number; text: string; minutesAgo: number }>,
  ) {
    // Check if already exists by name
    const existing = await prisma.conversation.findFirst({
      where: { name, type },
    });
    if (existing) return;

    const conv = await prisma.conversation.create({
      data: {
        name,
        type,
        ownerId: type === ConversationType.CREW ? owner.id : null,
        participants: {
          create: [
            {
              userId: owner.id,
              role: type === ConversationType.CREW ? 'OWNER' : 'MEMBER',
            },
            ...members
              .filter((m) => m.id !== owner.id)
              .map((m) => ({ userId: m.id, role: 'MEMBER' as const })),
          ],
        },
      },
    });
    convCount++;

    let lastMessage: { text: string; createdAt: Date } | null = null;
    for (const m of messages) {
      const createdAt = new Date(Date.now() - m.minutesAgo * 60_000);
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          senderId: m.from,
          text: m.text,
          createdAt,
        },
      });
      lastMessage = { text: m.text, createdAt };
      msgCount++;
    }

    if (lastMessage) {
      await prisma.conversation.update({
        where: { id: conv.id },
        data: {
          lastMessageText: lastMessage.text,
          lastMessageAt: lastMessage.createdAt,
        },
      });
    }
  }

  const [beeko, neeko, lig, mimi, yuna, hana] = seedUsers;

  // Private: organizer <-> Beeko
  await seedPrivateConversation(
    organizer,
    beeko,
    [
      { from: beeko.id,     text: 'Hey, is the RPD event still on this weekend?', minutesAgo: 120 },
      { from: organizer.id, text: 'Yes! Saturday 2pm at Trocadéro 🎶',              minutesAgo: 115 },
      { from: beeko.id,     text: 'Perfect, see you there!',                         minutesAgo: 110 },
    ],
  );

  // Private: Neeko <-> Beeko
  await seedPrivateConversation(
    neeko,
    beeko,
    [
      { from: beeko.id, text: 'On lance un Random Play Dance ce week-end ? 👀', minutesAgo: 60 },
      { from: neeko.id, text: 'Yes ! On pensait faire ça samedi vers 17h.',      minutesAgo: 55 },
      { from: neeko.id, text: 'Place Saint-Pierre pourrait être cool, il y a de la place pour danser.', minutesAgo: 50 },
    ],
  );

  // Private: Mimi <-> Yuna
  await seedPrivateConversation(
    mimi,
    yuna,
    [
      { from: mimi.id, text: 'Tu vas au festival de Bordeaux ?', minutesAgo: 180 },
      { from: yuna.id, text: 'Carrément ! Je prépare déjà mon outfit 💜', minutesAgo: 170 },
    ],
  );

  // Group: Kosmos crew (Bordeaux RPD)
  await seedGroupConversation(
    'Kosmos crew',
    ConversationType.CREW,
    organizer,
    [organizer, beeko, neeko, lig, mimi],
    [
      { from: organizer.id, text: '🎶 Random Play Dance organisé samedi !',              minutesAgo: 240 },
      { from: organizer.id, text: '📍 Place Saint-Pierre',                                  minutesAgo: 240 },
      { from: organizer.id, text: '🕒 17h',                                                  minutesAgo: 240 },
      { from: organizer.id, text: 'Playlist K-pop multi-générations (2nd → 5th gen). Venez nombreux 🔥', minutesAgo: 235 },
      { from: lig.id,       text: 'On prépare aussi quelques challenges freestyle 👀',     minutesAgo: 230 },
      { from: beeko.id,     text: 'Trop hâte, on sera là 💃',                              minutesAgo: 100 },
    ],
  );

  // Group: Bordeaux Dancers
  await seedGroupConversation(
    'Bordeaux Dancers',
    ConversationType.GROUP,
    beeko,
    [beeko, neeko, lig, hana],
    [
      { from: beeko.id, text: 'Qui est dispo pour répéter demain ?', minutesAgo: 300 },
      { from: hana.id,  text: 'Moi ! 15h ça marche ?',                 minutesAgo: 290 },
      { from: lig.id,   text: 'OK pour moi aussi',                       minutesAgo: 280 },
    ],
  );

  // ─── Event group chats ─────────────────────────────────────────────────
  // Built the same way ConversationsService.ensureEventConversation builds
  // them — GROUP, named after the event, owned by its organizer — because the
  // app has to recognise them as the event's own thread, not as a stray group.
  console.log('Seeding event chats...');
  const byUsername = new Map<string, { id: number }>(
    seedUsers.map((u) => [u.username, { id: u.id }]),
  );
  byUsername.set('organizer', { id: organizer.id });

  for (const event of seededEvents) {
    const script = BORDEAUX_EVENT_CHATS[event.title];
    if (!script) continue;

    // eventId is unique: one event, one thread. Re-running the seed must not
    // try for a second.
    const existing = await prisma.conversation.findUnique({
      where: { eventId: event.id },
      select: { id: true },
    });
    if (existing) continue;

    const speakers = [...new Set(script.map((m) => m.from))]
      .map((name) => byUsername.get(name))
      .filter((u): u is { id: number } => u !== undefined)
      .filter((u) => u.id !== organizer.id);

    // Everyone who speaks below has to be at the event and allowed to post:
    // attendees join an event chat read-only, and only the organizer can
    // change that. Seeding messages from people who could not have sent them
    // would put the demo at odds with its own rules.
    for (const speaker of speakers) {
      await prisma.eventParticipation.upsert({
        where: { userId_eventId: { userId: speaker.id, eventId: event.id } },
        create: { userId: speaker.id, eventId: event.id },
        update: {},
      });
    }

    const conversation = await prisma.conversation.create({
      data: {
        type: ConversationType.GROUP,
        name: event.title,
        eventId: event.id,
        ownerId: organizer.id,
        participants: {
          create: [
            { userId: organizer.id, role: 'OWNER' },
            ...speakers.map((s) => ({ userId: s.id, role: 'WRITER' as const })),
          ],
        },
      },
    });
    convCount++;

    // Anyone else already signed up joins as a reader, which is what the app
    // does for an attendee who has not been given the microphone.
    const attendees = await prisma.eventParticipation.findMany({
      where: { eventId: event.id },
      select: { userId: true },
    });
    const seated = new Set([organizer.id, ...speakers.map((s) => s.id)]);
    for (const { userId } of attendees) {
      if (seated.has(userId)) continue;
      await prisma.conversationParticipant.create({
        data: { userId, conversationId: conversation.id, role: 'MEMBER' },
      });
    }

    let lastEventMessage: { text: string; createdAt: Date } | null = null;
    for (const m of script) {
      const sender = byUsername.get(m.from);
      if (!sender) continue;
      const createdAt = new Date(Date.now() - m.minutesAgo * 60_000);
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: sender.id,
          text: m.text,
          createdAt,
        },
      });
      lastEventMessage = { text: m.text, createdAt };
      msgCount++;
    }

    if (lastEventMessage) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageText: lastEventMessage.text,
          lastMessageAt: lastEventMessage.createdAt,
        },
      });
    }
  }

  console.log(`Seeded ${convCount} new conversations with ${msgCount} messages.`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
