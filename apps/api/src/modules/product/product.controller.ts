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
  Put,
  Query,
} from '@nestjs/common';
import { IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { SetBundleItemsDto } from './dto/bundle-items.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

class AddAddonDto {
  @IsUUID() addonServiceId!: string;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceOverride?: number;
}

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @RequirePermissions('PRODUCT.READ')
  findAll(@Query('serviceLine') serviceLine?: string, @Query('active') active?: string) {
    // active=1 — 새로 고를 때는 '사용' 상품만(관리 화면은 전체)
    return this.productService.findAll(serviceLine, active === '1' || active === 'true');
  }

  @Get(':id')
  @RequirePermissions('PRODUCT.READ')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productService.findOneWithAddons(id);
  }

  /** 상품 구성(필수·기본선택·선택 + 구성별 단가) 전체 저장 */
  @Put(':id/items')
  @RequirePermissions('PRODUCT.UPDATE')
  setItems(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetBundleItemsDto) {
    return this.productService.setItems(id, dto.items);
  }

  @Post(':id/addons')
  @RequirePermissions('PRODUCT.UPDATE')
  addAddon(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddAddonDto) {
    return this.productService.addAddon(id, dto.addonServiceId, dto.priceOverride);
  }

  @Delete(':id/addons/:addonId')
  @RequirePermissions('PRODUCT.UPDATE')
  @HttpCode(204)
  removeAddon(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('addonId', ParseUUIDPipe) addonId: string,
  ) {
    return this.productService.removeAddon(id, addonId);
  }

  @Post()
  @RequirePermissions('PRODUCT.CREATE')
  create(@Body() dto: CreateProductDto) {
    return this.productService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('PRODUCT.UPDATE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.productService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('PRODUCT.DELETE')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.productService.remove(id);
  }
}
