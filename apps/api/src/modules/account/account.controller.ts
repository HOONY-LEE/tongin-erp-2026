import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AccountService } from './account.service';
import {
  AccountEmployeeDto,
  CheckLoginIdDto,
  CreateAccountDto,
  ResetAccountPasswordDto,
  SetAccountEmployeeDto,
  SetAccountRolesDto,
  UpdateAccountDto,
} from './dto/create-account.dto';
import type { AuthPrincipal } from '@tongin/shared';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('accounts')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get()
  @RequirePermissions('USER.READ')
  list() {
    return this.accountService.list();
  }

  @Get('roles')
  @RequirePermissions('USER.READ')
  roles() {
    return this.accountService.roles();
  }

  @Get('check-login-id')
  @RequirePermissions('USER.CREATE')
  checkLoginId(@Query() q: CheckLoginIdDto) {
    return this.accountService.checkLoginId(q.loginId);
  }

  @Post()
  @RequirePermissions('USER.CREATE')
  create(@Body() dto: CreateAccountDto, @CurrentUser() user: AuthPrincipal) {
    return this.accountService.create(dto, user);
  }

  @Put(':id/roles')
  @RequirePermissions('USER.UPDATE')
  setRoles(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetAccountRolesDto,
  ) {
    return this.accountService.setRoles(id, dto.roles, user);
  }

  @Put(':id/employee')
  @RequirePermissions('USER.UPDATE')
  setEmployee(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetAccountEmployeeDto,
  ) {
    return this.accountService.setEmployee(id, dto.employeeId, user);
  }

  @Put(':id/profile')
  @RequirePermissions('USER.UPDATE')
  setProfile(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccountEmployeeDto,
  ) {
    return this.accountService.setProfile(id, dto, user);
  }

  /** 비밀번호 재설정(관리자) — 본인 계정은 '내 비밀번호 바꾸기'로 */
  @Put(':id/password')
  @RequirePermissions('USER.UPDATE')
  resetPassword(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetAccountPasswordDto,
  ) {
    return this.accountService.resetPassword(id, dto.password, user);
  }

  @Patch(':id')
  @RequirePermissions('USER.UPDATE')
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountService.setActive(id, dto.isActive ?? true, user);
  }
}
