import { IsArray, IsInt, ArrayMinSize } from 'class-validator';

export class AddParticipantsDto {
  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(1)
  userIds!: number[];
}
