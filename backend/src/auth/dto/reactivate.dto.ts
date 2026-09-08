import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Asks for a deleted account back.
 *
 * The proof required follows from the account, exactly as it did when the
 * account was deleted: a password account re-types its password and then
 * receives a code at the address it used to hold, a social account comes back
 * through its provider.
 */
export class ReactivateDto {
  /** The address the account held before it was deleted. */
  @IsEmail()
  @MaxLength(100)
  email!: string;

  /** For accounts whose provider is "email". */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  password?: string;

  /** For Google / Apple accounts: a current Supabase access token. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  accessToken?: string;
}

/** The second half of an email account's reactivation. */
export class ConfirmReactivationDto {
  @IsEmail()
  @MaxLength(100)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10)
  code!: string;
}
