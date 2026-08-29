import { IsInt, IsString, MaxLength, MinLength } from 'class-validator';

export class JoinConversationDto {
  @IsInt()
  conversationId!: number;
}

export class SendMessageDto {
  @IsInt()
  conversationId!: number;

  /**
   * Bounded on purpose: an unbounded socket frame is written straight to a
   * TEXT column and then fanned out to every participant, so a single client
   * could push megabytes into the database and to every other device.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;
}

export class DeleteMessageDto {
  @IsInt()
  conversationId!: number;

  @IsInt()
  messageId!: number;
}
