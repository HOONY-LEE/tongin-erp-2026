import { Module } from '@nestjs/common';
import { DriveController } from './drive.controller';
import { DriveService } from './drive.service';
import { GoogleDriveService } from './google-drive.service';

/** 드라이브 — 내·조직·공유 드라이브의 폴더·파일, 구글 드라이브 연동 */
@Module({
  controllers: [DriveController],
  providers: [DriveService, GoogleDriveService],
  exports: [GoogleDriveService],
})
export class DriveModule {}
