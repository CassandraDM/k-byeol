import { IsString } from 'class-validator';

export class VerifyResetCodeDto {
  @IsString()
  token: string;
}
