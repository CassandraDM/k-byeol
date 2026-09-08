import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Proof that the person asking for the deletion is the account holder, and not
 * somebody who walked up to an unlocked phone.
 *
 * Which of the two fields applies is decided by the account's provider, not by
 * the caller: an email account confirms with its password, a Google or Apple
 * account with a fresh session from that provider. Social accounts hold a
 * random password generated at signup that the user has never seen, so asking
 * them to re-type it would be asking for something that does not exist.
 */
export class DeleteAccountDto {
  /** Required for accounts whose provider is "email". */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  password?: string;

  /** Required for Google / Apple accounts: a current Supabase access token. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  accessToken?: string;
}
