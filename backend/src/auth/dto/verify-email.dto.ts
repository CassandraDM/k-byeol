import { IsString } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  code: string;
}
