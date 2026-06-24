import { PartialType } from '@nestjs/mapped-types';
import { CreateCommonCodeDto } from './create-common-code.dto';

export class UpdateCommonCodeDto extends PartialType(CreateCommonCodeDto) {}
