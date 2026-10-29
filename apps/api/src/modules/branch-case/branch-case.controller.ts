import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthPrincipal } from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { BranchCaseService } from './branch-case.service';
import { CreateBranchCaseDto, UpdateBranchCaseDto } from './dto/branch-case.dto';

@Controller('branch-cases')
export class BranchCaseController {
  constructor(private readonly cases: BranchCaseService) {}

  @Get()
  @RequirePermissions('BRANCH_CASE.READ')
  findAll(
    @CurrentUser() p: AuthPrincipal,
    @Query('branchId') branchId?: string,
    @Query('kind') kind?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.cases.findAll(p, { branchId, kind, status, q });
  }

  @Get(':id')
  @RequirePermissions('BRANCH_CASE.READ')
  findOne(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.cases.findOne(p, id);
  }

  @Post()
  @RequirePermissions('BRANCH_CASE.CREATE')
  create(@CurrentUser() p: AuthPrincipal, @Body() dto: CreateBranchCaseDto) {
    return this.cases.create(p, dto);
  }

  @Patch(':id')
  @RequirePermissions('BRANCH_CASE.UPDATE')
  update(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchCaseDto,
  ) {
    return this.cases.update(p, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('BRANCH_CASE.DELETE')
  remove(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.cases.remove(p, id);
  }
}
