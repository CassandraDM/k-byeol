/**
 * How long a deleted account can still be brought back.
 *
 * It lives on its own rather than in account.service because auth needs it too
 * — the sign-in routes are where a returning user meets it — and AccountService
 * already depends on AuthService. A shared constant is not worth a cycle.
 *
 * Deleting destroys nothing; this window is how long that stays true. When it
 * closes, AccountPurgeService makes the deletion real.
 */
export const GRACE_PERIOD_DAYS = 30;

/** The cutoff a deletion must be more recent than to still be undoable. */
export function reactivationCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
}
