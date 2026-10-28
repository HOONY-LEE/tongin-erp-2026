import {
  BadRequestException,
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
import { APPROVAL_DOC_TYPES, type ApprovalDocType, type AuthPrincipal } from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { ApprovalService, type ApprovalBox } from './approval.service';
import { ActApprovalDto, SaveLineTemplateDto, SubmitGeneralDto } from './dto/approval-line.dto';

const BOXES: ApprovalBox[] = ['todo', 'mine', 'cc', 'all'];

/**
 * 전자결재. 내 결재함·결재 처리·품의 상신은 로그인만으로(직원 연결 계정),
 * 전체 열람은 APPROVAL.READ, 기본 결재선 설정은 APPROVAL.MANAGE.
 */
@Controller('approvals')
export class ApprovalController {
  constructor(private readonly approvals: ApprovalService) {}

  @Get()
  list(@CurrentUser() p: AuthPrincipal, @Query('box') box = 'todo') {
    if (!BOXES.includes(box as ApprovalBox))
      throw new BadRequestException(`box는 ${BOXES.join(' | ')} 중 하나여야 합니다.`);
    return this.approvals.list(p, box as ApprovalBox);
  }

  @Get('pending-count')
  pendingCount(@CurrentUser() p: AuthPrincipal) {
    return this.approvals.pendingCount(p);
  }

  /** 신청 화면의 기본 결재선 미리보기 */
  @Get('line-preview')
  preview(@CurrentUser() p: AuthPrincipal, @Query('docType') docType: string) {
    if (!APPROVAL_DOC_TYPES.includes(docType as ApprovalDocType))
      throw new BadRequestException(
        `docType은 ${APPROVAL_DOC_TYPES.join(' | ')} 중 하나여야 합니다.`,
      );
    return this.approvals.previewLine(docType as ApprovalDocType, p);
  }

  @Get('line-templates')
  @RequirePermissions('APPROVAL.MANAGE')
  templates() {
    return this.approvals.listTemplates();
  }

  @Post('line-templates')
  @RequirePermissions('APPROVAL.MANAGE')
  createTemplate(@Body() dto: SaveLineTemplateDto) {
    return this.approvals.createTemplate(dto);
  }

  @Patch('line-templates/:id')
  @RequirePermissions('APPROVAL.MANAGE')
  updateTemplate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveLineTemplateDto) {
    return this.approvals.updateTemplate(id, dto);
  }

  @Delete('line-templates/:id')
  @RequirePermissions('APPROVAL.MANAGE')
  @HttpCode(204)
  removeTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.approvals.removeTemplate(id);
  }

  /** 일반 품의 상신 */
  @Post()
  submit(@CurrentUser() p: AuthPrincipal, @Body() dto: SubmitGeneralDto) {
    return this.approvals.submitGeneral(p, dto);
  }

  @Get(':id')
  get(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.approvals.get(id, p);
  }

  @Post(':id/act')
  act(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActApprovalDto,
  ) {
    return this.approvals.act(id, p, dto.action, dto.comment);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.approvals.cancel(id, p);
  }
}
