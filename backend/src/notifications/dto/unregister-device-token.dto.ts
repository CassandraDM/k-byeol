import { IsString, MaxLength, MinLength } from 'class-validator';

export class UnregisterDeviceTokenDto {
  @IsString()
  @MinLength(10)
  @MaxLength(255)
  token!: string;
}
