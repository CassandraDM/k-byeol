import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * parseFloat that leaves an absent value absent.
 *
 * A bare `parseFloat(undefined)` yields NaN, which `@IsOptional()` won't skip
 * and `??` won't fall back from — the value would reach the query as NaN and
 * silently match nothing.
 */
const toOptionalNumber = ({
  value,
}: {
  value: unknown;
}): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value);
  // Anything else (e.g. a repeated `?radiusKm=` giving an array) is rejected
  // by @IsNumber rather than silently coerced.
  return NaN;
};

/** Query params accepted by `GET /events`. */
export class QueryEventsDto {
  @Transform(({ value }) => parseFloat(value as string))
  @IsNumber()
  lat!: number;

  @Transform(({ value }) => parseFloat(value as string))
  @IsNumber()
  lng!: number;

  /**
   * Search radius in kilometres. `radius` is the original spelling and stays
   * accepted so older clients keep working.
   */
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  @Min(0)
  radiusKm?: number;

  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  @Min(0)
  radius?: number;

  /** Free-text search over the event title and description. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  /** Inclusive lower bound on the event date (YYYY-MM-DD). */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateFrom must be in YYYY-MM-DD format',
  })
  dateFrom?: string;

  /** Inclusive upper bound on the event date (YYYY-MM-DD). */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateTo must be in YYYY-MM-DD format',
  })
  dateTo?: string;
}
