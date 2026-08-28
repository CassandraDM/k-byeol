import { PartialType } from '@nestjs/mapped-types';
import { CreateEventDto } from './create-event.dto';

/**
 * Every field of CreateEventDto, all optional.
 *
 * Do NOT replace this with `Partial<CreateEventDto>` in the controller
 * signature: `Partial<T>` is a compile-time type, it produces no runtime class,
 * so class-validator finds no metadata and the body goes through completely
 * unvalidated. PartialType() builds a real class and copies the decorators
 * over, marking each one @IsOptional().
 */
export class UpdateEventDto extends PartialType(CreateEventDto) {}
