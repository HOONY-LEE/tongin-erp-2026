import { PartialType } from '@nestjs/mapped-types';
import { CreateAddonServiceDto } from './create-addon-service.dto';

export class UpdateAddonServiceDto extends PartialType(CreateAddonServiceDto) {}
