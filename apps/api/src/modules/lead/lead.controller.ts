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
import { LeadService, type LeadSearch } from './lead.service';
import { CancelLeadDto, RejectLeadDto } from './dto/reject-lead.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { TransitionLeadDto } from './dto/transition-lead.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '@tongin/shared';
import { AccessLog } from '../../audit/access-log';

@Controller('leads')
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  @AccessLog('lead', 'LIST')
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

  /** 접수 목록 화면 — 필터·검색·상태 탭을 서버에서(목록 + 탭 숫자 + 지역 목록) */
  @AccessLog('lead', 'LIST')
  @Get('search')
  @RequirePermissions('LEAD.READ')
  search(@CurrentUser() user: AuthPrincipal, @Query() q: Record<string, string>) {
    const list = (v?: string) => (v ? v.split(',').filter(Boolean) : undefined);
    const yn = (v?: string) => (v === 'yes' || v === 'no' ? v : undefined);
    const period = ['createdAt', 'moveDate', 'visitDate'].includes(q.period)
      ? (q.period as LeadSearch['period'])
      : undefined;
    return this.leadService.search(
      {
        q: q.q?.slice(0, 100),
        stage: q.stage,
        period,
        from: q.from,
        to: q.to,
        source: list(q.source),
        serviceLine: list(q.serviceLine),
        fromSido: list(q.fromSido),
        orgUnitId: list(q.org)
          ?.filter((x) => /^[0-9a-f-]{36}$/i.test(x))
          .slice(0, 50),
        owner: yn(q.owner),
        contract: yn(q.contract),
      },
      user,
    );
  }

  /** 중복 접수 찾기 — 같은 출발지 주소·서비스 요청일로 이미 들어온 접수 */
  @Get('duplicates')
  @RequirePermissions('LEAD.CREATE')
  duplicates(
    @CurrentUser() user: AuthPrincipal,
    @Query('fromAddr') fromAddr = '',
    @Query('moveDate') moveDate = '',
  ) {
    return this.leadService.duplicates(fromAddr.slice(0, 300), moveDate.slice(0, 10), user);
  }

  @AccessLog('lead', 'VIEW')
  @Get(':id')
  @RequirePermissions('LEAD.READ')
  findOne(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.leadService.findOne(id, user);
  }

  @AccessLog('lead', 'VIEW')
  @Get(':id/case')
  @RequirePermissions('LEAD.READ')
  caseView(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.leadService.caseView(id, user);
  }

  @Post()
  @RequirePermissions('LEAD.CREATE')
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateLeadDto) {
    return this.leadService.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('LEAD.UPDATE')
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadService.update(id, dto, user);
  }

  @Post(':id/transition')
  @RequirePermissions('LEAD.UPDATE')
  transition(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionLeadDto,
  ) {
    return this.leadService.transitionTo(id, dto.to, user);
  }

  /** 지점 반려 — 본사로 되돌린다(형태·사유) */
  @Post(':id/reject')
  @RequirePermissions('LEAD.UPDATE')
  reject(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectLeadDto,
  ) {
    return this.leadService.reject(id, dto, user);
  }

  /** 접수 취소 — 형태·사유 */
  @Post(':id/cancel')
  @RequirePermissions('LEAD.UPDATE')
  cancel(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelLeadDto,
  ) {
    return this.leadService.cancel(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('LEAD.DELETE')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.leadService.remove(id, user);
  }
}
