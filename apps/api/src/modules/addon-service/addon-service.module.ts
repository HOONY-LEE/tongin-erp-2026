import { Module } from '@nestjs/common';
import { AddonServiceController } from './addon-service.controller';
import { AddonServiceService } from './addon-service.service';

@Module({
  controllers: [AddonServiceController],
  providers: [AddonServiceService],
})
export class AddonServiceModule {}
