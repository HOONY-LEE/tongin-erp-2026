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

@Controller('support-tickets')
export class SupportController {
  constructor(private readonly service: SupportService) {}

  @Get()
  @RequirePermissions('SUPPORT.READ')
  findAll(
    @CurrentUser() user: AuthPrincipal,
    @Query('kind') kind?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAll(kind, status, user);
  }

  @Get(':id')
  @RequirePermissions('SUPPORT.READ')
  findOne(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequirePermissions('SUPPORT.WRITE')
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateTicketDto) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('SUPPORT.WRITE')
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/transition')
  @RequirePermissions('SUPPORT.WRITE')
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
