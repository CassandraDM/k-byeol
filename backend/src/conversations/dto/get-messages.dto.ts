import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Query params of `GET /conversations/:id/messages`.
 *
 * Replaces a manual `parseInt` in the controller: an absent param used to
 * become NaN, and `limit` had no ceiling — `?limit=9999999` would have
 * returned the entire history in one response.
 */
const toOptionalInt = ({ value }: { value: unknown }): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseInt(value, 10);
  return NaN;
};

export class GetMessagesDto {
  /** Cursor: return messages older than this message id. */
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  before?: number;

  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
