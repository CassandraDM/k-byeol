import {
  canActOn,
  canSetRoleOf,
  composerState,
  conversationTitle,
  fetchConversations,
  isEventChat,
  muteParticipant,
  removeFromConversation,
  setParticipantRole,
  sortedMembers,
  unmuteParticipant,
  type Conversation,
  type ConversationParticipant,
  type ParticipantRole,
} from '@/utils/conversations';
import { apiFetch } from '@/utils/api';

jest.mock('@/utils/api', () => ({ apiFetch: jest.fn() }));

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const respond = (ok: boolean, body: unknown = {}, status = ok ? 200 : 500) =>
  ({ ok, status, json: async () => body }) as Response;

const ME = 1;
const THEM = 2;

const member = (
  id: number,
  username: string,
  role: ParticipantRole,
  overrides: Partial<ConversationParticipant> = {},
): ConversationParticipant => ({
  id,
  username,
  avatar: null,
  role,
  isMuted: false,
  mutedUntil: null,
  ...overrides,
});

const conversation = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: 100,
  type: 'GROUP',
  name: 'Random play dance',
  ownerId: THEM,
  eventId: 10,
  lastMessageText: null,
  lastMessageAt: null,
  createdAt: '2026-08-01T10:00:00.000Z',
  myRole: 'MEMBER',
  isRestricted: true,
  roleAllowsWrite: false,
  canWrite: false,
  canModerate: false,
  canManage: false,
  isOwner: false,
  isMuted: false,
  mutedUntil: null,
  participants: [member(THEM, 'Beeko', 'OWNER'), member(ME, 'Neeko', 'MEMBER')],
  ...overrides,
});

beforeEach(() => {
  mockedFetch.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('composerState', () => {
  it('opens the composer for anyone allowed to post', () => {
    expect(composerState(conversation({ canWrite: true }))).toEqual({
      enabled: true,
      notice: null,
    });
  });

  it('locks an event chat for a reader, and says why', () => {
    const state = composerState(conversation());

    expect(state.enabled).toBe(false);
    expect(state.notice).toContain('Only the organiser can post');
    // A disabled input with no explanation reads as a bug.
    expect(state.notice).toContain('still see every message');
  });

  it('explains a permanent mute ahead of the role', () => {
    // A muted writer is silenced for a different reason than a reader is.
    const state = composerState(
      conversation({ myRole: 'WRITER', roleAllowsWrite: true, isMuted: true }),
    );

    expect(state.notice).toContain('muted');
    expect(state.notice).toContain('read-only');
    // Says how it ends, so it does not read as permanent exclusion.
    expect(state.notice).toContain('lifts it');
  });

  it('names the deadline of a timed mute', () => {
    const until = new Date(Date.now() + 3_600_000).toISOString();
    const state = composerState(
      conversation({ isMuted: true, mutedUntil: until }),
    );

    expect(state.notice).toContain('muted until');
  });

  it('explains a crew thread in its own terms', () => {
    const state = composerState(
      conversation({ type: 'CREW', eventId: null, canWrite: false }),
    );

    expect(state.notice).toContain('owner and its writers');
  });

  it('always supplies a notice when it disables the composer', () => {
    for (const c of [
      conversation(),
      conversation({ isMuted: true }),
      conversation({ type: 'CREW', eventId: null }),
      conversation({ eventId: null, isRestricted: false }),
    ]) {
      const state = composerState(c);
      expect(state.enabled).toBe(false);
      expect(state.notice).toBeTruthy();
    }
  });

  it('trusts the API rather than re-deriving the rule', () => {
    const promoted = conversation({ myRole: 'MODERATOR', canWrite: true });
    expect(composerState(promoted).enabled).toBe(true);
  });
});

describe('conversationTitle', () => {
  it('names a direct thread after the other person', () => {
    const direct = conversation({
      type: 'PRIVATE',
      name: null,
      eventId: null,
      participants: [
        member(ME, 'Neeko', 'MEMBER'),
        member(THEM, 'Beeko', 'MEMBER'),
      ],
    });

    expect(conversationTitle(direct, ME)).toBe('Beeko');
  });

  it('uses the thread name for an event chat', () => {
    expect(conversationTitle(conversation(), ME)).toBe('Random play dance');
  });

  it('falls back when a group has no name', () => {
    expect(conversationTitle(conversation({ name: null }), ME)).toBe(
      'Group chat',
    );
  });

  it('does not name a direct thread after the reader', () => {
    const direct = conversation({
      type: 'PRIVATE',
      name: null,
      participants: [member(ME, 'Neeko', 'MEMBER')],
    });
    expect(conversationTitle(direct, ME)).toBe('Conversation');
  });
});

describe('isEventChat', () => {
  it('recognises an event thread by its link, not its type', () => {
    expect(isEventChat({ eventId: 10 })).toBe(true);
    expect(isEventChat({ eventId: null })).toBe(false);
  });
});

describe('sortedMembers', () => {
  it('ranks the most senior first, then sorts by name', () => {
    const ordered = sortedMembers([
      member(5, 'Zoe', 'MEMBER'),
      member(4, 'Adam', 'MEMBER'),
      member(3, 'Yuna', 'WRITER'),
      member(2, 'Mimi', 'MODERATOR'),
      member(6, 'Cassy', 'ADMIN'),
      member(1, 'Beeko', 'OWNER'),
    ]);

    expect(ordered.map((m) => m.username)).toEqual([
      'Beeko',
      'Cassy',
      'Mimi',
      'Yuna',
      'Adam',
      'Zoe',
    ]);
  });

  it('leaves the caller’s array untouched', () => {
    const original = [member(2, 'Zoe', 'MEMBER'), member(1, 'Beeko', 'OWNER')];
    sortedMembers(original);
    expect(original.map((m) => m.username)).toEqual(['Zoe', 'Beeko']);
  });
});

describe('canActOn', () => {
  const asRole = (myRole: ParticipantRole, canModerate: boolean) =>
    conversation({ myRole, canModerate });

  it('offers nothing to somebody without moderation rights', () => {
    expect(
      canActOn(asRole('WRITER', false), member(THEM, 'Beeko', 'MEMBER')),
    ).toBe(false);
  });

  it('never offers an action against the organizer', () => {
    expect(
      canActOn(asRole('ADMIN', true), member(THEM, 'Beeko', 'OWNER')),
    ).toBe(false);
  });

  it('lets a co-organizer act on anyone below the organizer', () => {
    const admin = asRole('ADMIN', true);
    for (const role of ['ADMIN', 'MODERATOR', 'WRITER', 'MEMBER'] as const) {
      expect(canActOn(admin, member(THEM, 'X', role))).toBe(true);
    }
  });

  it('keeps a moderator below the co-organizers who appointed them', () => {
    const mod = asRole('MODERATOR', true);
    expect(canActOn(mod, member(THEM, 'X', 'ADMIN'))).toBe(false);
    expect(canActOn(mod, member(THEM, 'X', 'MODERATOR'))).toBe(false);
    expect(canActOn(mod, member(THEM, 'X', 'WRITER'))).toBe(true);
  });
});

describe('a mute suspends the role', () => {
  it('locks the composer for a muted admin and says it is read-only', () => {
    // The API has already worked out that the mute wins; the copy has to
    // match, or a muted admin is told only the organiser may post.
    const state = composerState(
      conversation({
        myRole: 'ADMIN',
        roleAllowsWrite: true,
        canWrite: false,
        isMuted: true,
      }),
    );

    expect(state.enabled).toBe(false);
    expect(state.notice).toContain('muted');
    expect(state.notice).toContain('read-only');
  });

  it('hides the moderation controls while the mute holds', () => {
    // canModerate arrives already false from the API for a muted moderator.
    const muted = conversation({ myRole: 'MODERATOR', canModerate: false });
    expect(canActOn(muted, member(THEM, 'X', 'WRITER'))).toBe(false);
  });

  it('hides the role picker for a muted co-organizer', () => {
    const muted = conversation({ myRole: 'ADMIN', canManage: false });
    expect(canSetRoleOf(muted, member(THEM, 'X', 'WRITER'))).toBe(false);
  });

  it('keeps showing the stored role, since it comes back', () => {
    const muted = member(THEM, 'Mimi', 'MODERATOR', { isMuted: true });
    expect(muted.role).toBe('MODERATOR');
  });
});

describe('canSetRoleOf', () => {
  it('needs role-management rights, which moderators lack', () => {
    expect(
      canSetRoleOf(
        conversation({ myRole: 'MODERATOR', canManage: false }),
        member(THEM, 'X', 'WRITER'),
      ),
    ).toBe(false);
  });

  it('never offers to change the organizer’s role', () => {
    expect(
      canSetRoleOf(
        conversation({ myRole: 'ADMIN', canManage: true }),
        member(THEM, 'Beeko', 'OWNER'),
      ),
    ).toBe(false);
  });

  it('lets a co-organizer set anyone else’s role', () => {
    expect(
      canSetRoleOf(
        conversation({ myRole: 'ADMIN', canManage: true }),
        member(THEM, 'X', 'MEMBER'),
      ),
    ).toBe(true);
  });
});

describe('management calls', () => {
  it('PUTs the chosen role', async () => {
    mockedFetch.mockResolvedValueOnce(respond(true));

    await expect(setParticipantRole(100, THEM, 'MODERATOR')).resolves.toBe(
      true,
    );
    expect(mockedFetch).toHaveBeenCalledWith(
      '/conversations/100/participants/2/role',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ role: 'MODERATOR' }),
      }),
    );
  });

  it('sends a duration when muting for a while', async () => {
    mockedFetch.mockResolvedValueOnce(respond(true));

    await muteParticipant(100, THEM, 60);
    expect(mockedFetch).toHaveBeenCalledWith(
      '/conversations/100/participants/2/mute',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ minutes: 60 }),
      }),
    );
  });

  it('sends an empty body for a mute with no end date', async () => {
    mockedFetch.mockResolvedValueOnce(respond(true));

    await muteParticipant(100, THEM);
    expect(mockedFetch).toHaveBeenCalledWith(
      '/conversations/100/participants/2/mute',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({}) }),
    );
  });

  it('lifts a mute with a DELETE and no body', async () => {
    mockedFetch.mockResolvedValueOnce(respond(true));

    await unmuteParticipant(100, THEM);
    expect(mockedFetch).toHaveBeenCalledWith(
      '/conversations/100/participants/2/mute',
      { method: 'DELETE' },
    );
  });

  it('removes a member through the participants path', async () => {
    mockedFetch.mockResolvedValueOnce(respond(true));

    await removeFromConversation(100, THEM);
    expect(mockedFetch).toHaveBeenCalledWith(
      '/conversations/100/participants/2',
      { method: 'DELETE' },
    );
  });

  it('reports a refused action as false rather than throwing', async () => {
    mockedFetch.mockResolvedValueOnce(respond(false, {}, 403));
    await expect(setParticipantRole(100, THEM, 'ADMIN')).resolves.toBe(false);
  });

  it('survives the network being down', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(removeFromConversation(100, THEM)).resolves.toBe(false);
  });
});

describe('fetchConversations', () => {
  it('distinguishes a failed read from an empty inbox', async () => {
    mockedFetch.mockResolvedValueOnce(respond(false, {}, 500));
    await expect(fetchConversations()).resolves.toBeNull();

    mockedFetch.mockResolvedValueOnce(respond(true, []));
    await expect(fetchConversations()).resolves.toEqual([]);
  });
});
