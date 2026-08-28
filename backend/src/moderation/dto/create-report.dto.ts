import { IsIn, IsInt, IsString, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateReportDto {
  @IsIn(['USER', 'EVENT'])
  targetType!: 'USER' | 'EVENT';

  @Type(() => Number)
  @IsInt()
  targetId!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}
