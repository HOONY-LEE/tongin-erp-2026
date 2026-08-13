import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthPrincipal } from '@tongin/shared';
import { FieldService } from './field.service';
import { WorkOrderService } from '../work-order/work-order.service';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

/**
 * 현장(태블릿·폰) 전용 API.
 * 관리자 화면과 달리 한 번의 요청으로 작업지시서를 통째로 내려준다 —
 * 신호가 약한 현장에서 왕복을 줄이고, 오프라인 캐시 단위를 화면과 일치시키기 위함.
 */
@Controller('field')
export class FieldController {
  constructor(
    private readonly field: FieldService,
    private readonly workOrders: WorkOrderService,
  ) {}

  /** 내 작업 목록. from/to 없으면 전체(최근순 200건). */
  @Get('work-orders')
  @RequirePermissions('WORK_ORDER.READ')
  list(@CurrentUser() user: AuthPrincipal, @Query('from') from?: string, @Query('to') to?: string) {
    return this.field.list(user, from, to);
  }

  /** 작업지시서 — 고객·주소·품목·작업지시 메모·배정까지 한 번에. */
  @Get('work-orders/:id')
  @RequirePermissions('WORK_ORDER.READ')
  detail(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.field.detail(id, user);
  }

  /**
   * 작업 시작·완료는 관리자 화면과 같은 상태머신을 쓴다(리드 전이까지 한 트랜잭션).
   * 현장에서 쓰려면 WORK_ORDER.WRITE 권한이 있어야 한다 — 전속업체 기본 역할은 조회만이라
   * 시작·완료를 맡기려면 해당 계정에 쓰기 권한을 부여해야 한다.
   */
  @Post('work-orders/:id/start')
  @RequirePermissions('WORK_ORDER.WRITE')
  start(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.humanize(this.workOrders.start(id, user), '시작');
  }

  @Post('work-orders/:id/complete')
  @RequirePermissions('WORK_ORDER.WRITE')
  complete(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.humanize(this.workOrders.complete(id, user), '완료');
  }

  /**
   * 상태머신 오류("허용되지 않은 상태 전이: RECEIVED → IN_PROGRESS")는 현장 직원이 읽을 수 없다.
   * 무엇을 해야 하는지 알려주는 문장으로 바꾼다. 다른 오류는 그대로 통과시킨다.
   */
  private async humanize<T>(work: Promise<T>, action: string): Promise<T> {
    try {
      return await work;
    } catch (e) {
      if (e instanceof BadRequestException && /상태 전이/.test((e as Error).message)) {
        throw new BadRequestException(
          `지금은 작업을 ${action}할 수 없습니다. 접수 건의 진행 상태가 맞지 않으니 담당 지점에 문의해 주세요.`,
        );
      }
      throw e;
    }
  }
}
