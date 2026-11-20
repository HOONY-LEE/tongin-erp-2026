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
  Put,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthPrincipal } from '@tongin/shared';
import { EmployeeService } from './employee.service';
import {
  AddConcurrentOrgDto,
  ChecklistTemplateDto,
  ChecklistToggleDto,
  CreateEmployeeDto,
  EmployeePhotoDto,
  ResignEmployeeDto,
} from './dto/create-employee.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { AccessLog } from '../../audit/access-log';

@Controller('employees')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @AccessLog('employee', 'LIST')
  @Get()
  @RequirePermissions('EMPLOYEE.READ')
  findAll(@Query('orgUnitId') orgUnitId?: string) {
    return this.employeeService.findAll(orgUnitId);
  }

  @AccessLog('employee', 'VIEW')
  @Get(':id')
  @RequirePermissions('EMPLOYEE.READ')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeeService.findOne(id);
  }

  @Post()
  @RequirePermissions('EMPLOYEE.CREATE')
  create(@CurrentUser() p: AuthPrincipal, @Body() dto: CreateEmployeeDto) {
    return this.employeeService.create(dto, p.userId);
  }

  @Patch(':id')
  @RequirePermissions('EMPLOYEE.UPDATE')
  update(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeeService.update(id, dto, p.userId);
  }

  /** 프로필 사진 — 로그인한 직원이면 누구나 본다(사내 연락처처럼) */
  @Get(':id/photo')
  async photo(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const p = await this.employeeService.photo(id);
    res.set({
      'Content-Type': p.mediaType,
      'Content-Length': String(p.bytes.length),
      // 주소에 ?v=바뀐시각 이 붙어 사진이 바뀌면 주소도 바뀐다
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(p.bytes);
  }

  /** 사진 바꾸기 — 인사 수정 권한이 있거나 본인(권한 검사는 서비스에서) */
  @Put(':id/photo')
  setPhoto(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmployeePhotoDto,
  ) {
    return this.employeeService.setPhoto(id, p, dto.data);
  }

  @Delete(':id/photo')
  removePhoto(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.employeeService.removePhoto(id, p);
  }

  /** 인사기록 카드 — 인사 정보·입퇴사 체크리스트·발령 이력 */
  @AccessLog('employee-hr', 'VIEW')
  @Get(':id/hr')
  @RequirePermissions('EMPLOYEE.READ')
  hr(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeeService.hrRecord(id);
  }

  /** 겸직(추가 소속) 더하기 — 같은 조직이면 그 조직 직책만 바꾼다 */
  @Post(':id/concurrent-orgs')
  @RequirePermissions('EMPLOYEE.UPDATE')
  addConcurrent(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddConcurrentOrgDto,
  ) {
    return this.employeeService.addConcurrent(id, dto, p.userId);
  }

  @Delete(':id/concurrent-orgs/:orgUnitId')
  @RequirePermissions('EMPLOYEE.UPDATE')
  removeConcurrent(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('orgUnitId', ParseUUIDPipe) orgUnitId: string,
  ) {
    return this.employeeService.removeConcurrent(id, orgUnitId, p.userId);
  }

  /** 퇴사 처리 — 재직 해제·연결 계정 로그인 막기·퇴사 체크리스트 */
  @Post(':id/resign')
  @RequirePermissions('EMPLOYEE.UPDATE')
  resign(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResignEmployeeDto,
  ) {
    return this.employeeService.resign(id, dto, p.userId);
  }

  @Post(':id/checklist/:kind')
  @RequirePermissions('EMPLOYEE.UPDATE')
  openChecklist(@Param('id', ParseUUIDPipe) id: string, @Param('kind') kind: string) {
    return this.employeeService.openChecklist(id, kind === 'OFFBOARD' ? 'OFFBOARD' : 'ONBOARD');
  }

  @Patch(':id/checklist-items/:itemId')
  @RequirePermissions('EMPLOYEE.UPDATE')
  toggleChecklist(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: ChecklistToggleDto,
  ) {
    return this.employeeService.toggleChecklist(id, itemId, dto.done, p.userId);
  }

  @Get('checklist-templates/all')
  @RequirePermissions('EMPLOYEE.READ')
  checklistTemplates() {
    return this.employeeService.checklistTemplates();
  }

  @Post('checklist-templates')
  @RequirePermissions('EMPLOYEE.UPDATE')
  createChecklistTemplate(@Body() dto: ChecklistTemplateDto) {
    return this.employeeService.createChecklistTemplate(dto);
  }

  @Patch('checklist-templates/:id')
  @RequirePermissions('EMPLOYEE.UPDATE')
  updateChecklistTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChecklistTemplateDto,
  ) {
    return this.employeeService.updateChecklistTemplate(id, dto);
  }

  @Delete('checklist-templates/:id')
  @RequirePermissions('EMPLOYEE.UPDATE')
  @HttpCode(204)
  removeChecklistTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeeService.removeChecklistTemplate(id);
  }

  @Delete(':id')
  @RequirePermissions('EMPLOYEE.DELETE')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeeService.remove(id);
  }
}
