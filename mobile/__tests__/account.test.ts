import {
  confirmationMethod,
  deleteAccountError,
  exportFileName,
  providerLabel,
} from '@/utils/account';

/**
 * The decisions the delete and export flows make before any network call:
 * which proof the account can give, and what a failure should say.
 */

describe('confirmationMethod', () => {
  it('asks a password account for its password', () => {
    expect(confirmationMethod('email')).toBe('password');
  });

  it.each(['google', 'apple'])('sends a %s account back to the provider', (p) => {
    // Their password is a random string minted at signup that they have never
    // seen — asking them to re-type it would be asking for nothing.
    expect(confirmationMethod(p)).toBe('provider');
  });

  it('falls back to a password when the provider is unknown', () => {
    // A stored value from an older build, or a profile that never loaded. The
    // password path is the one that can still fail safely.
    expect(confirmationMethod(null)).toBe('password');
    expect(confirmationMethod(undefined)).toBe('password');
    expect(confirmationMethod('facebook')).toBe('password');
  });
});

describe('providerLabel', () => {
  it('names the provider the way its button does', () => {
    expect(providerLabel('google')).toBe('Google');
    expect(providerLabel('apple')).toBe('Apple');
  });

  it('stays vague rather than wrong for anything else', () => {
    expect(providerLabel('email')).toBe('your provider');
    expect(providerLabel(null)).toBe('your provider');
  });
});

describe('exportFileName', () => {
  it('dates the file so a second export does not overwrite the first', () => {
    expect(exportFileName(new Date('2026-09-08T14:30:00.000Z'))).toBe(
      'k-byeol-export-2026-09-08.json',
    );
  });
});

describe('deleteAccountError', () => {
  it('says the password is wrong, because that is fixable', () => {
    expect(deleteAccountError(401, null)).toMatch(/password/i);
  });

  it('passes a 400 through — the API already said what was missing', () => {
    expect(
      deleteAccountError(400, { message: 'Sign in with google again' }),
    ).toBe('Sign in with google again');
  });

  it('takes the first of several validation messages', () => {
    expect(deleteAccountError(400, { message: ['first', 'second'] })).toBe(
      'first',
    );
  });

  it('tells the user to wait when they have been rate limited', () => {
    expect(deleteAccountError(429, null)).toMatch(/wait/i);
  });

  it('apologises for anything else rather than leaking a 500', () => {
    expect(deleteAccountError(500, null)).not.toMatch(/500/);
    expect(deleteAccountError(500, null)).toBeTruthy();
  });
});
