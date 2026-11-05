import { Module } from '@nestjs/common';
import { TelephonyController, TelephonyHookController } from './telephony.controller';
import { TelephonyHub } from './telephony-hub.service';
import { TelephonyService } from './telephony.service';

/** 전화 수신(콜팝업) — 회선 웹훅으로 수신을 받아 권한 있는 직원 화면에 실시간으로 띄운다 */
@Module({
  controllers: [TelephonyHookController, TelephonyController],
  providers: [TelephonyService, TelephonyHub],
})
export class TelephonyModule {}
