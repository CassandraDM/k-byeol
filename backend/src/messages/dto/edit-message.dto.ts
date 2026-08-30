import { IsString, MaxLength, MinLength } from 'class-validator';

export class EditMessageDto {
  /**
   * Bounded exactly like the socket frame that created the message — an edit
   * writes to the same TEXT column and fans out to the same participants, so
   * it needs the same ceiling.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;
}
