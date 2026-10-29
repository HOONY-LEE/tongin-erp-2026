import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { AuthPrincipal, MenuLayout, MenuTargetKind, PersonalMenuLayout } from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { MenuService } from './menu.service';

class PersonalDto {
  @IsArray()
  @ArrayMaxSize(20)
  groups!: PersonalMenuLayout['groups'];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  hidden?: string[];
}

class TargetDto {
  @IsIn(['ORG', 'ROLE', 'POSITION', 'USER'])
  kind!: MenuTargetKind;

  @IsUUID()
  targetId!: string;
}

class ProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string | null;

  @IsOptional()
  @IsObject()
  layout?: MenuLayout;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TargetDto)
  targets?: TargetDto[];
}

/** 사이드바 메뉴 — 내 메뉴(권한 없이) + 관리자 메뉴 구성(MENU.*) */
@Controller('menus')
export class MenuController {
  constructor(private readonly menus: MenuService) {}

  @Get('me')
  me(@CurrentUser() user: AuthPrincipal) {
    return this.menus.me(user);
  }

  @Put('me')
  saveMine(@CurrentUser() user: AuthPrincipal, @Body() dto: PersonalDto) {
    return this.menus.saveMine(user, { groups: dto.groups, hidden: dto.hidden ?? [] });
  }

  @Delete('me')
  resetMine(@CurrentUser() user: AuthPrincipal) {
    return this.menus.resetMine(user);
  }

  @Get('profiles')
  @RequirePermissions('MENU.READ')
  list() {
    return this.menus.list();
  }

  @Get('profiles/:id')
  @RequirePermissions('MENU.READ')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.menus.get(id);
  }

  @Post('profiles')
  @RequirePermissions('MENU.CREATE')
  create(@Body() dto: ProfileDto) {
    return this.menus.create(dto);
  }

  @Patch('profiles/:id')
  @RequirePermissions('MENU.UPDATE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ProfileDto) {
    return this.menus.update(id, dto);
  }

  @Delete('profiles/:id')
  @RequirePermissions('MENU.DELETE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.menus.remove(id);
  }

  @Get('preview/:userId')
  @RequirePermissions('MENU.READ')
  preview(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.menus.previewFor(userId);
  }
}
