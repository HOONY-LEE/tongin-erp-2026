import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PriceConditionService } from './price-condition.service';
import { CreatePriceConditionDto } from './dto/create-price-condition.dto';
import { UpdatePriceConditionDto } from './dto/update-price-condition.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('price-conditions')
export class PriceConditionController {
  constructor(private readonly priceConditionService: PriceConditionService) {}

  @Get()
  @RequirePermissions('PRICE_CONDITION.READ')
  findAll(@Query('partnerId') partnerId?: string) {
    return this.priceConditionService.findAll(partnerId);
  }

  @Get(':id')
  @RequirePermissions('PRICE_CONDITION.READ')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.priceConditionService.findOne(id);
  }

  @Post()
  @RequirePermissions('PRICE_CONDITION.WRITE')
  create(@Body() dto: CreatePriceConditionDto) {
    return this.priceConditionService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('PRICE_CONDITION.WRITE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePriceConditionDto) {
    return this.priceConditionService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('PRICE_CONDITION.WRITE')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.priceConditionService.remove(id);
  }
}
