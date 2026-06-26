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
import { LeadService } from './lead.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { TransitionLeadDto } from './dto/transition-lead.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '@tongin/shared';

@Controller('leads')
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  @Get()
  @RequirePermissions('LEAD.READ')
  findAll(
    @CurrentUser() user: AuthPrincipal,
    @Query('status') status?: string,
    @Query('source') source?: string,
    @Query('orgUnitId') orgUnitId?: string,
  ) {
    return this.leadService.findAll({ status, source, orgUnitId }, user);
  }

  @Get(':id')
  @RequirePermissions('LEAD.READ')
  findOne(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.leadService.findOne(id, user);
  }

  @Get(':id/case')
  @RequirePermissions('LEAD.READ')
  caseView(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.leadService.caseView(id, user);
  }

  @Post()
  @RequirePermissions('LEAD.WRITE')
  create(@Body() dto: CreateLeadDto) {
    return this.leadService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('LEAD.WRITE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeadDto) {
    return this.leadService.update(id, dto);
  }

  @Post(':id/transition')
  @RequirePermissions('LEAD.WRITE')
  transition(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TransitionLeadDto) {
    return this.leadService.transitionTo(id, dto.to);
  }

  @Delete(':id')
  @RequirePermissions('LEAD.WRITE')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.leadService.remove(id);
  }
}
