import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** A day's worth of minutes — the longest timed mute worth offering. */
const MAX_MINUTES = 60 * 24 * 7;

export class MuteParticipantDto {
  /**
   * How long the mute lasts. Omit it for a mute with no end date — that is
   * what "definitively" means, rather than a date far in the future.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_MINUTES)
  minutes?: number;
}
