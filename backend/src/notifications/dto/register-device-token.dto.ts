import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDeviceTokenDto {
  /** Expo push token, e.g. "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]". */
  @IsString()
  @MinLength(10)
  @MaxLength(255)
  token!: string;

  @IsOptional()
  @IsIn(['ios', 'android', 'web'])
  platform?: string;
}
