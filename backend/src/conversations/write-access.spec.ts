import {
  canDeleteMessage,
  canManageNow,
  canModerateNow,
  canWriteNow,
  effectiveRole,
  isMutedNow,
  isRestricted,
  refuseMemberAction,
  refuseRoleChange,
  roleCanManage,
  roleCanModerate,
  roleCanWrite,
} from './write-access';

const OPEN_GROUP = { type: 'GROUP', eventId: null };
const DIRECT = { type: 'PRIVATE', eventId: null };
const CREW = { type: 'CREW', eventId: null };
/** An event chat is a GROUP that happens to carry an eventId. */
const EVENT_CHAT = { type: 'GROUP', eventId: 42 };

const NOW = new Date('2026-08-28T12:00:00.000Z');
const unmuted = (role: string) => ({ role, isMuted: false, mutedUntil: null });

describe('isRestricted', () => {
  it('leaves ordinary threads open', () => {
    expect(isRestricted(DIRECT)).toBe(false);
    expect(isRestricted(OPEN_GROUP)).toBe(false);
  });

  it('locks down crews and event chats', () => {
    expect(isRestricted(CREW)).toBe(true);
    expect(isRestricted(EVENT_CHAT)).toBe(true);
  });

  it('keys off the event link, not the conversation type', () => {
    // The event chat is stored as a GROUP — if this looked at `type` alone it
    // would let every participant post.
    expect(isRestricted({ type: 'GROUP', eventId: 1 })).toBe(true);
  });
});

describe('the permission matrix', () => {
  // Exactly the table the roles were specified from.
  const MATRIX = [
    { role: 'OWNER', write: true, moderate: true, manage: true },
    { role: 'ADMIN', write: true, moderate: true, manage: true },
    { role: 'MODERATOR', write: true, moderate: true, manage: false },
    { role: 'WRITER', write: true, moderate: false, manage: false },
    { role: 'MEMBER', write: false, moderate: false, manage: false },
  ];

  it.each(MATRIX)(
    '$role: write=$write moderate=$moderate manage=$manage',
    ({ role, write, moderate, manage }) => {
      expect(roleCanWrite(EVENT_CHAT, role)).toBe(write);
      expect(roleCanModerate(EVENT_CHAT, role)).toBe(moderate);
      expect(roleCanManage(EVENT_CHAT, role)).toBe(manage);
    },
  );

  it('applies the same matrix to crews', () => {
    expect(roleCanWrite(CREW, 'MEMBER')).toBe(false);
    expect(roleCanModerate(CREW, 'MODERATOR')).toBe(true);
    expect(roleCanManage(CREW, 'MODERATOR')).toBe(false);
  });

  it('lets anyone post in a direct or open group thread', () => {
    for (const conversation of [DIRECT, OPEN_GROUP]) {
      expect(roleCanWrite(conversation, 'MEMBER')).toBe(true);
    }
  });

  it('offers no moderation or role management in an open thread', () => {
    // There are no roles worth managing there, so the controls stay hidden.
    expect(roleCanModerate(OPEN_GROUP, 'OWNER')).toBe(false);
    expect(roleCanManage(OPEN_GROUP, 'OWNER')).toBe(false);
  });

  it('fails closed on a role it does not recognise', () => {
    expect(roleCanWrite(EVENT_CHAT, 'SUPERUSER')).toBe(false);
    expect(roleCanModerate(EVENT_CHAT, '')).toBe(false);
    expect(roleCanManage(EVENT_CHAT, 'admin')).toBe(false);
  });
});

describe('isMutedNow', () => {
  it('is not muted when the flag is off', () => {
    expect(isMutedNow({ isMuted: false, mutedUntil: null }, NOW)).toBe(false);
  });

  it('treats a mute with no end date as permanent', () => {
    expect(isMutedNow({ isMuted: true, mutedUntil: null }, NOW)).toBe(true);
  });

  it('is still muted before the deadline', () => {
    const later = new Date(NOW.getTime() + 60_000);
    expect(isMutedNow({ isMuted: true, mutedUntil: later }, NOW)).toBe(true);
  });

  it('lifts itself once the deadline passes', () => {
    // No sweep clears these — they expire by being read.
    const past = new Date(NOW.getTime() - 1);
    expect(isMutedNow({ isMuted: true, mutedUntil: past }, NOW)).toBe(false);
  });

  it('ignores a stale deadline when the flag was cleared', () => {
    const later = new Date(NOW.getTime() + 60_000);
    expect(isMutedNow({ isMuted: false, mutedUntil: later }, NOW)).toBe(false);
  });
});

describe('a mute suspends the whole role', () => {
  const muted = (role: string) => ({
    role,
    isMuted: true,
    mutedUntil: null,
  });

  it('reports a muted participant as a plain reader', () => {
    // The stored role is left alone; only what counts right now changes.
    expect(effectiveRole(muted('ADMIN'), NOW)).toBe('MEMBER');
    expect(effectiveRole(unmuted('ADMIN'), NOW)).toBe('ADMIN');
  });

  it('takes moderation and role management away for the duration', () => {
    expect(canModerateNow(EVENT_CHAT, muted('ADMIN'), NOW)).toBe(false);
    expect(canManageNow(EVENT_CHAT, muted('ADMIN'), NOW)).toBe(false);
    expect(canModerateNow(EVENT_CHAT, muted('MODERATOR'), NOW)).toBe(false);
  });

  it('gives all of it back the moment a timed mute expires', () => {
    const past = new Date(NOW.getTime() - 1);
    const expired = { role: 'ADMIN', isMuted: true, mutedUntil: past };

    expect(effectiveRole(expired, NOW)).toBe('ADMIN');
    expect(canWriteNow(EVENT_CHAT, expired, NOW)).toBe(true);
    expect(canModerateNow(EVENT_CHAT, expired, NOW)).toBe(true);
    expect(canManageNow(EVENT_CHAT, expired, NOW)).toBe(true);
  });

  it('leaves an unmuted co-organizer with everything', () => {
    expect(canModerateNow(EVENT_CHAT, unmuted('ADMIN'), NOW)).toBe(true);
    expect(canManageNow(EVENT_CHAT, unmuted('ADMIN'), NOW)).toBe(true);
  });

  it('does not let a muted moderator act on anyone', () => {
    // Their effective role is what reaches the rule.
    expect(
      refuseMemberAction(
        EVENT_CHAT,
        effectiveRole(muted('MODERATOR'), NOW),
        'WRITER',
      ),
    ).toBe('not-allowed');
  });

  it('still protects a muted co-organizer from a moderator', () => {
    // Protection follows standing, not current voice — the target's stored
    // role is what reaches the rule.
    expect(refuseMemberAction(EVENT_CHAT, 'MODERATOR', 'ADMIN')).toBe(
      'not-allowed',
    );
  });
});

describe('canWriteNow', () => {
  it('lets an unmuted writer post', () => {
    expect(canWriteNow(EVENT_CHAT, unmuted('WRITER'), NOW)).toBe(true);
  });

  it('silences a muted writer', () => {
    expect(
      canWriteNow(
        EVENT_CHAT,
        { role: 'WRITER', isMuted: true, mutedUntil: null },
        NOW,
      ),
    ).toBe(false);
  });

  it('silences even a co-organizer', () => {
    // Mute outranks the role, or it would be useless against the people most
    // able to disrupt a thread.
    expect(
      canWriteNow(
        EVENT_CHAT,
        { role: 'ADMIN', isMuted: true, mutedUntil: null },
        NOW,
      ),
    ).toBe(false);
  });

  it('lets them speak again the moment a timed mute expires', () => {
    const past = new Date(NOW.getTime() - 1);
    expect(
      canWriteNow(
        EVENT_CHAT,
        { role: 'WRITER', isMuted: true, mutedUntil: past },
        NOW,
      ),
    ).toBe(true);
  });

  it('does not give a reader a voice just because they are unmuted', () => {
    expect(canWriteNow(EVENT_CHAT, unmuted('MEMBER'), NOW)).toBe(false);
  });
});

describe('refuseMemberAction', () => {
  it('never lets anyone mute or remove the organizer', () => {
    expect(refuseMemberAction(EVENT_CHAT, 'ADMIN', 'OWNER')).toBe(
      'owner-untouchable',
    );
    expect(refuseMemberAction(EVENT_CHAT, 'OWNER', 'OWNER')).toBe(
      'owner-untouchable',
    );
  });

  it('lets a co-organizer act on anyone below the organizer', () => {
    // "Everyone but the organizer" includes other co-organizers.
    for (const target of ['ADMIN', 'MODERATOR', 'WRITER', 'MEMBER']) {
      expect(refuseMemberAction(EVENT_CHAT, 'ADMIN', target)).toBeNull();
    }
  });

  it('keeps a moderator below the co-organizers who appointed them', () => {
    expect(refuseMemberAction(EVENT_CHAT, 'MODERATOR', 'ADMIN')).toBe(
      'not-allowed',
    );
    expect(refuseMemberAction(EVENT_CHAT, 'MODERATOR', 'MODERATOR')).toBe(
      'not-allowed',
    );
  });

  it('lets a moderator act on writers and readers', () => {
    expect(refuseMemberAction(EVENT_CHAT, 'MODERATOR', 'WRITER')).toBeNull();
    expect(refuseMemberAction(EVENT_CHAT, 'MODERATOR', 'MEMBER')).toBeNull();
  });

  it('refuses anyone without moderation rights', () => {
    expect(refuseMemberAction(EVENT_CHAT, 'WRITER', 'MEMBER')).toBe(
      'not-allowed',
    );
    expect(refuseMemberAction(EVENT_CHAT, 'MEMBER', 'MEMBER')).toBe(
      'not-allowed',
    );
  });
});

describe('refuseRoleChange', () => {
  it('lets the owner assign any assignable role', () => {
    for (const role of ['MEMBER', 'WRITER', 'MODERATOR', 'ADMIN']) {
      expect(refuseRoleChange(EVENT_CHAT, 'OWNER', 'MEMBER', role)).toBeNull();
    }
  });

  it('refuses to mint a second owner', () => {
    expect(refuseRoleChange(EVENT_CHAT, 'OWNER', 'MEMBER', 'OWNER')).toBe(
      'owner-unassignable',
    );
  });

  it("refuses to change the owner's role", () => {
    expect(refuseRoleChange(EVENT_CHAT, 'ADMIN', 'OWNER', 'MEMBER')).toBe(
      'owner-untouchable',
    );
  });

  it('refuses a moderator changing roles', () => {
    expect(refuseRoleChange(EVENT_CHAT, 'MODERATOR', 'MEMBER', 'WRITER')).toBe(
      'not-allowed',
    );
  });
});

describe('canDeleteMessage', () => {
  const mine = { senderId: 7 };
  const theirs = { senderId: 8 };

  it('lets people take back their own words whatever their role', () => {
    expect(
      canDeleteMessage(EVENT_CHAT, { userId: 7, role: 'MEMBER' }, mine),
    ).toBe(true);
  });

  it('lets a moderator delete somebody else’s message', () => {
    expect(
      canDeleteMessage(EVENT_CHAT, { userId: 7, role: 'MODERATOR' }, theirs),
    ).toBe(true);
  });

  it('refuses a writer deleting somebody else’s message', () => {
    expect(
      canDeleteMessage(EVENT_CHAT, { userId: 7, role: 'WRITER' }, theirs),
    ).toBe(false);
  });

  it('still lets an author delete their own message in an open thread', () => {
    expect(
      canDeleteMessage(OPEN_GROUP, { userId: 7, role: 'MEMBER' }, mine),
    ).toBe(true);
  });

  it('gives nobody moderation powers in an open thread', () => {
    expect(
      canDeleteMessage(OPEN_GROUP, { userId: 7, role: 'OWNER' }, theirs),
    ).toBe(false);
  });
});
