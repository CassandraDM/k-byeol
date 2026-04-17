/**
 * Decodes the `sub` (user id) claim from a JWT without verifying its signature.
 * Returns `null` if the token is missing or malformed.
 */
export function getUserIdFromToken(token: string | null): number | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.sub === 'number' ? payload.sub : null;
  } catch {
    return null;
  }
}
