import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

/** 근태 — 출퇴근 기록·엑셀 업로드·판정, 정정 신청은 전자결재(ATTENDANCE_FIX)로 */
@Module({
  imports: [ApprovalModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
