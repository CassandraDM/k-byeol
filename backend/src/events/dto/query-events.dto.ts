import { IsNumber, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class QueryEventsDto {
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  lat!: number;

  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  lng!: number;

  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  radius?: number = 10;
}
