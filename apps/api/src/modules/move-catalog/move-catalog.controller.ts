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
} from '@nestjs/common';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { MoveCatalogService } from './move-catalog.service';
import {
  CreateHandlingMethodDto,
  CreateRoomTemplateDto,
  SetRoomItemsDto,
  UpdateHandlingMethodDto,
  UpdateRoomTemplateDto,
} from './dto/move-catalog.dto';

/** 방 틀 — 견적 물품정보의 기본 방과 방마다 자주 들어가는 이사물품 */
@Controller('room-templates')
export class RoomTemplateController {
  constructor(private readonly svc: MoveCatalogService) {}

  @Get()
  @RequirePermissions('CBM_ITEM.READ')
  list() {
    return this.svc.listRooms();
  }

  @Post()
  @RequirePermissions('CBM_ITEM.WRITE')
  create(@Body() dto: CreateRoomTemplateDto) {
    return this.svc.createRoom(dto);
  }

  @Patch(':id')
  @RequirePermissions('CBM_ITEM.WRITE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoomTemplateDto) {
    return this.svc.updateRoom(id, dto);
  }

  @Put(':id/items')
  @RequirePermissions('CBM_ITEM.WRITE')
  setItems(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetRoomItemsDto) {
    return this.svc.setRoomItems(id, dto.itemIds);
  }

  @Delete(':id')
  @RequirePermissions('CBM_ITEM.WRITE')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.removeRoom(id);
  }
}

/** 처리방법 — 운반·폐기·경유 …와 각각이 들어가는 물량 칸 */
@Controller('handling-methods')
export class HandlingMethodController {
  constructor(private readonly svc: MoveCatalogService) {}

  @Get()
  @RequirePermissions('CBM_ITEM.READ')
  list() {
    return this.svc.listHandlings();
  }

  @Post()
  @RequirePermissions('CBM_ITEM.WRITE')
  create(@Body() dto: CreateHandlingMethodDto) {
    return this.svc.createHandling(dto);
  }

  @Patch(':id')
  @RequirePermissions('CBM_ITEM.WRITE')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHandlingMethodDto) {
    return this.svc.updateHandling(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('CBM_ITEM.WRITE')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.removeHandling(id);
  }
}
