import { Module } from '@nestjs/common';
import { PositionController, RoleController } from './access.controller';
import { AccessService } from './access.service';

@Module({
  controllers: [RoleController, PositionController],
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
