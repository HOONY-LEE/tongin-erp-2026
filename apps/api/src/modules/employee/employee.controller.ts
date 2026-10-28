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
import type { AuthPrincipal } from '@tongin/shared';
import { EmployeeService } from './employee.service';
import {
  ChecklistTemplateDto,
  ChecklistToggleDto,
  CreateEmployeeDto,
  ResignEmployeeDto,
} from './dto/create-employee.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';

@Controller('employees')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Get()
  @RequirePermissions('EMPLOYEE.READ')
  findAll(@Query('orgUnitId') orgUnitId?: string) {
    return this.employeeService.findAll(orgUnitId);
  }

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

  /** 인사기록 카드 — 인사 정보·입퇴사 체크리스트·발령 이력 */
  @Get(':id/hr')
  @RequirePermissions('EMPLOYEE.READ')
  hr(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeeService.hrRecord(id);
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
