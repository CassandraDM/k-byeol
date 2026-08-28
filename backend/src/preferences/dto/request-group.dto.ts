import { IsString, MaxLength, MinLength } from 'class-validator';

/** Body of `POST /users/me/preferences/groups/request`. */
export class RequestGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}
