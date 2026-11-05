import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

/**
 * 콜팝업 실시간 알림 — 서버 메모리 안의 방송(API 인스턴스가 하나라는 전제).
 * 고객 정보는 싣지 않는다: 받은 화면이 자기 권한으로 /telephony/calls/:id 를 다시 묻는다.
 */
export interface CallSignal {
  type: 'ringing' | 'updated' | 'ended';
  callId: string;
}

@Injectable()
export class TelephonyHub {
  readonly signals = new Subject<CallSignal>();

  emit(signal: CallSignal) {
    this.signals.next(signal);
  }
}
