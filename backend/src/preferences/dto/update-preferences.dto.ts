import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  cityCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  cityName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  cityPostalCode?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  groupIds?: number[];

  /** Whether events from blocked users stay off the map and out of search. */
  @IsOptional()
  @IsBoolean()
  hideBlockedEvents?: boolean;
}
