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
import type { AuthPrincipal } from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { AccessService } from './access.service';
import {
  CreatePositionDto,
  CreateRoleDto,
  ReorderDto,
  SetRolePermissionsDto,
  UpdatePositionDto,
  UpdateRoleDto,
} from './dto/access.dto';

/** 권한 그룹(메뉴×CRUD 묶음) */
@Controller('roles')
export class RoleController {
  constructor(private readonly access: AccessService) {}

  @Get()
  @RequirePermissions('ROLE.READ')
  list() {
    return this.access.listRoles();
  }

  @Post()
  @RequirePermissions('ROLE.CREATE')
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: AuthPrincipal) {
    return this.access.createRole(dto, user);
  }

  @Put('order')
  @RequirePermissions('ROLE.UPDATE')
  reorder(@Body() dto: ReorderDto) {
    return this.access.reorderRoles(dto.ids);
  }

  @Patch(':id')
  @RequirePermissions('ROLE.UPDATE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.access.updateRole(id, dto);
  }

  @Put(':id/permissions')
  @RequirePermissions('ROLE.UPDATE')
  setPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRolePermissionsDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.access.setRolePermissions(id, dto.permissions, user);
  }

  @Delete(':id')
  @RequirePermissions('ROLE.DELETE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.access.deleteRole(id);
  }
}

/** 직책·직급 — 권한과 별개(표시·인사용) */
@Controller('positions')
export class PositionController {
  constructor(private readonly access: AccessService) {}

  // 직원 화면에서 직책을 고를 때도 쓰므로 직원 조회 권한으로 읽는다
  @Get()
  @RequirePermissions('EMPLOYEE.READ')
  list() {
    return this.access.listPositions();
  }

  @Post()
  @RequirePermissions('ROLE.CREATE')
  create(@Body() dto: CreatePositionDto) {
    return this.access.createPosition(dto);
  }

  @Put('order')
  @RequirePermissions('ROLE.UPDATE')
  reorder(@Body() dto: ReorderDto) {
    return this.access.reorderPositions(dto.ids);
  }

  @Patch(':id')
  @RequirePermissions('ROLE.UPDATE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePositionDto) {
    return this.access.updatePosition(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('ROLE.DELETE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.access.deletePosition(id);
  }
}
