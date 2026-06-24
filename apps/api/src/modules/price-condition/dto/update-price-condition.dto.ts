import { PartialType } from '@nestjs/mapped-types';
import { CreatePriceConditionDto } from './create-price-condition.dto';

export class UpdatePriceConditionDto extends PartialType(CreatePriceConditionDto) {}
