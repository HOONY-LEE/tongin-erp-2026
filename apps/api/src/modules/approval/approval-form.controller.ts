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
import { PERMISSION_WILDCARD, type AuthPrincipal } from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { ApprovalFormService } from './approval-form.service';
import { SaveApprovalFormDto, SubmitFormDto } from './dto/approval-line.dto';

/**
 * 결재 양식 — 고르기·상신은 로그인만으로(직원 계정), 만들기·고치기는 APPROVAL.MANAGE.
 * 휴가 신청서(kind=LEAVE)도 여기서 추가 항목·업무 대리인 설정을 고친다.
 */
@Controller('approval-forms')
export class ApprovalFormController {
  constructor(private readonly forms: ApprovalFormService) {}

  /** 사용 중인 양식. all=1이면(관리) 꺼진 양식·휴가 신청서까지 */
  @Get()
  list(@CurrentUser() p: AuthPrincipal, @Query('all') all?: string) {
    const manage =
      p.permissions.includes(PERMISSION_WILDCARD) || p.permissions.includes('APPROVAL.MANAGE');
    return this.forms.list(all === '1' && manage);
  }

  /** 휴가 신청서 — 신청 화면이 추가 항목·설정을 읽는다 */
  @Get('leave')
  leave() {
    return this.forms.leaveForm();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.forms.get(id);
  }

  @Post()
  @RequirePermissions('APPROVAL.MANAGE')
  create(@CurrentUser() p: AuthPrincipal, @Body() dto: SaveApprovalFormDto) {
    return this.forms.create(p, dto);
  }

  @Patch(':id')
  @RequirePermissions('APPROVAL.MANAGE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveApprovalFormDto) {
    return this.forms.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('APPROVAL.MANAGE')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.forms.remove(id);
  }

  @Post(':id/submit')
  submit(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitFormDto,
  ) {
    return this.forms.submit(p, id, dto);
  }
}
