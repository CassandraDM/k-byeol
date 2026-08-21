import { IsIn, IsString } from 'class-validator';

export class SocialLoginDto {
  @IsIn(['google', 'apple'])
  provider: 'google' | 'apple';

  /** The Supabase access token obtained from the OAuth flow on the client. */
  @IsString()
  accessToken: string;
}
