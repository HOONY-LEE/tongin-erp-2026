import { IsIn } from 'class-validator';
import { LEAD_STATUS, type LeadStatus } from '@tongin/shared';

export class TransitionLeadDto {
  @IsIn(LEAD_STATUS)
  to!: LeadStatus;
}
