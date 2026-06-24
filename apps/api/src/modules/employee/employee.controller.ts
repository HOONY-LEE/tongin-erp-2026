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
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
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
  @RequirePermissions('EMPLOYEE.WRITE')
  create(@Body() dto: CreateEmployeeDto) {
    return this.employeeService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('EMPLOYEE.WRITE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeeService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('EMPLOYEE.WRITE')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeeService.remove(id);
  }
}
