import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  SUPPORT_TICKET_STATUS,
  type AuthPrincipal,
  type SupportTicketStatus,
} from '@tongin/shared';
import { SupportService } from './support.service';
import { CreateTicketDto, UpdateTicketDto } from './dto/support.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AccessLog } from '../../audit/access-log';

@Controller('support-tickets')
export class SupportController {
  constructor(private readonly service: SupportService) {}

  @AccessLog('support', 'LIST')
  @Get()
  @RequirePermissions('SUPPORT.READ')
  findAll(
    @CurrentUser() user: AuthPrincipal,
    @Query('kind') kind?: string,
    @Query('status') status?: string,
    @Query('f') f?: string,
    @Query('q') q?: string,
  ) {
    return this.service.findAll(kind, status, user, f, q);
  }

  /** 고객의 접수(견적건) — A/S 접수 창의 '관련 접수' */
  @Get('customer-leads')
  @RequirePermissions('SUPPORT.CREATE')
  customerLeads(
    @CurrentUser() user: AuthPrincipal,
    @Query('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.service.customerLeads(customerId, user);
  }

  /** 접수 유형(쓰는 것만) — 접수 창에서 고른다. 고치기는 공통 코드(관리자) */
  @Get('categories')
  @RequirePermissions('SUPPORT.READ')
  categories() {
    return this.service.categories();
  }

  @AccessLog('support', 'VIEW')
  @Get(':id')
  @RequirePermissions('SUPPORT.READ')
  findOne(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequirePermissions('SUPPORT.CREATE')
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateTicketDto) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('SUPPORT.UPDATE')
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/transition')
  @RequirePermissions('SUPPORT.UPDATE')
  transition(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('to') to: string,
  ) {
    if (!(SUPPORT_TICKET_STATUS as readonly string[]).includes(to)) {
      throw new BadRequestException(
        `상태는 ${SUPPORT_TICKET_STATUS.join(' | ')} 중 하나여야 합니다.`,
      );
    }
    return this.service.transition(id, to as SupportTicketStatus, user);
  }
}
