import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { EventType } from '@prisma/client';

export class CreateEventDto {
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsEnum(EventType)
  type!: EventType;

  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;

  @IsString()
  @MaxLength(500)
  address!: string;

  @IsString()
  date!: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'time must be in HH:mm format' })
  time!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;
}
