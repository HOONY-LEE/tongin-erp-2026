import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AccountService } from './account.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/create-account.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

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

  @Post()
  @RequirePermissions('USER.WRITE')
  create(@Body() dto: CreateAccountDto) {
    return this.accountService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('USER.WRITE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAccountDto) {
    return this.accountService.setActive(id, dto.isActive ?? true);
  }
}
