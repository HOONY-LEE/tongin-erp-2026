import { PartialType } from '@nestjs/mapped-types';
import { CreateCbmItemDto } from './create-cbm-item.dto';

export class UpdateCbmItemDto extends PartialType(CreateCbmItemDto) {}
