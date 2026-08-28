/** Claims we put in the access token (see AuthService.signToken). */
export interface JwtPayload {
  /** User id — the standard `sub` claim. */
  sub: number;
  email: string;
  iat?: number;
  exp?: number;
}

/** What the guards attach to the request / socket once the token checks out. */
export interface AuthUser {
  id: number;
  email: string;
}
