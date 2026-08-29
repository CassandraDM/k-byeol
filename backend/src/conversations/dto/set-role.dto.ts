import { IsIn } from 'class-validator';
import { ASSIGNABLE_ROLES, type AssignableRole } from '../write-access';

export class SetRoleDto {
  /**
   * OWNER is deliberately absent: a thread has exactly one owner, set when it
   * is created, and promoting a second one would leave two people able to
   * demote each other.
   */
  @IsIn(ASSIGNABLE_ROLES as readonly string[])
  role!: AssignableRole;
}
