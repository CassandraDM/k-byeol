import { getUserIdFromToken } from '@/utils/jwt';

/** Builds an unsigned token whose payload is `payload` — enough for a decoder. */
const tokenWith = (payload: object): string =>
  [
    'header',
    Buffer.from(JSON.stringify(payload)).toString('base64'),
    'signature',
  ].join('.');

describe('getUserIdFromToken', () => {
  it('reads the sub claim of a well-formed token', () => {
    expect(getUserIdFromToken(tokenWith({ sub: 42, email: 'a@b.com' }))).toBe(
      42,
    );
  });

  it('returns null when there is no token at all', () => {
    expect(getUserIdFromToken(null)).toBeNull();
    expect(getUserIdFromToken('')).toBeNull();
  });

  it('returns null instead of throwing on a malformed token', () => {
    expect(getUserIdFromToken('not-a-jwt')).toBeNull();
    expect(getUserIdFromToken('a.!!!not-base64!!!.c')).toBeNull();
  });

  it('returns null when the payload is not JSON', () => {
    const token = ['h', Buffer.from('hello').toString('base64'), 's'].join('.');
    expect(getUserIdFromToken(token)).toBeNull();
  });

  it('rejects a non-numeric sub rather than passing a string id downstream', () => {
    expect(getUserIdFromToken(tokenWith({ sub: '42' }))).toBeNull();
    expect(getUserIdFromToken(tokenWith({ email: 'a@b.com' }))).toBeNull();
  });
});
