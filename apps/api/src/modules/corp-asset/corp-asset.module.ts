import { Module } from '@nestjs/common';
import { CorpAssetController } from './corp-asset.controller';
import { CorpAssetService } from './corp-asset.service';

@Module({
  controllers: [CorpAssetController],
  providers: [CorpAssetService],
})
export class CorpAssetModule {}
