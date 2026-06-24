import { PartialType } from '@nestjs/mapped-types';
import { CreateLeadDto } from './create-lead.dto';

// orgUnitId는 생성 시 고정. 나머지 필드만 수정 허용.
export class UpdateLeadDto extends PartialType(CreateLeadDto) {}
