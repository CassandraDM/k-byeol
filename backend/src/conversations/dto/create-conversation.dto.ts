import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';
import { ConversationType } from '@prisma/client';

export class CreateConversationDto {
  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(2)
  participantIds!: number[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEnum(ConversationType)
  type?: ConversationType;
}
