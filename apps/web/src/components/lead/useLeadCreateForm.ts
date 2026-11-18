import { useEffect, useState } from 'react';
import { PARTNER_TYPE_LABEL, type PartnerType } from '@tongin/shared';
import { api } from '../../lib/api';
import { useOptions } from '../../lib/useOptions';
import { useOrgScope } from '../../lib/useOrgScope';
import { RECEIPT_SOURCES, SERVICE_LINES } from '../../lib/leadCodes';
import { useAuth } from '../../auth/AuthContext';
import type { FormField } from '../ui';

/**
 * 간편접수(접수 등록) 창의 항목과 기본값 — 접수 화면과 상담 콘솔이 같은 창을 쓴다.
 * withCallFields: 상담 콘솔에서 열 때 이사 희망일·고객 요청사항도 함께 보인다.
 */
export function useLeadCreateForm({ withCallFields = false }: { withCallFields?: boolean } = {}) {
  const { user } = useAuth();
  // 제휴·전속 업체 — 지점 직원도 고를 수 있게 접수 권한으로 받는 목록
  const [partners, setPartners] = useState<{ value: string; label: string; type: string }[]>([]);
  useEffect(() => {
    void api<{ id: string; name: string; type: string }[]>('/partners/options')
      .then((r) =>
        setPartners(
          r.map((p) => ({
            value: p.id,
            label: `[${PARTNER_TYPE_LABEL[p.type as PartnerType] ?? p.type}] ${p.name}`,
            type: p.type,
          })),
        ),
      )
      .catch(() => setPartners([]));
  }, []);

  // 담당 지점 — 목록은 전체를 보여주고, 권한 밖 지점만 흐리게(선택 불가) 처리한다.
  const { options: orgs, ownOrgId, unrestricted: isAdmin } = useOrgScope();

  // 담당자 — 기본값은 항상 본인. 권한이 넓은 사용자만 다른 직원으로 바꿀 수 있다.
  // 직원 목록(/employees)은 EMPLOYEE.READ가 있어야 읽히는데, 바꿀 수 없는 사용자에게는
  // 애초에 필요 없다 — 그 경우 본인 한 명만 담은 목록을 만들어 비활성 상태로 보여준다.
  const employees = useOptions('/employees', 'name');
  const ownEmpOption =
    user?.employeeId && user.employeeName
      ? [{ value: user.employeeId, label: user.employeeName }]
      : [];
  const ownerOptions = isAdmin && employees.length ? employees : ownEmpOption;

  const fields: FormField[] = [
    {
      name: 'customerName',
      label: '고객명',
      required: true,
      alwaysShow: true,
      pairWithNext: true,
      placeholder: '홍길동',
    },
    { name: 'customerPhone', label: '연락처', required: true, alwaysShow: true, type: 'tel' },
    {
      name: 'orgUnitId',
      label: '담당 지점',
      required: true,
      alwaysShow: true,
      pairWithNext: true,
      type: 'select',
      options: orgs,
    },
    {
      name: 'ownerEmpId',
      label: '담당자',
      alwaysShow: true,
      type: 'select',
      options: ownerOptions,
      // 본인 고정 — 담당자를 바꿀 권한이 없으면 목록을 열 필요도 없다.
      disabled: !isAdmin,
    },
    {
      name: 'source',
      label: '접수경로',
      alwaysShow: true,
      pairWithNext: true,
      type: 'select',
      options: RECEIPT_SOURCES,
    },
    {
      name: 'serviceLine',
      label: '상품명',
      required: true,
      alwaysShow: true,
      type: 'select',
      options: SERVICE_LINES,
    },
    { name: 'fromAddress', label: '출발지', alwaysShow: true, type: 'address', addrPrefix: 'from' },
    { name: 'toAddress', label: '도착지', alwaysShow: true, type: 'address', addrPrefix: 'to' },
    {
      name: 'partnerId',
      label: '제휴·전속 업체(제휴이사·전속이사) — 전속이사는 본사 부서로만 배정',
      type: 'select',
      searchable: true,
      alwaysShow: true,
      options: partners,
    },
    ...(withCallFields
      ? ([
          { name: 'moveDate', label: '이사 희망일', type: 'date', alwaysShow: true },
          { name: 'customerRequest', label: '고객 요청사항', type: 'textarea', alwaysShow: true },
        ] satisfies FormField[])
      : []),
  ];

  // ERP 화면에서 직원이 직접 등록하는 접수라 경로는 '시스템'이 기본이다.
  const defaults: Record<string, string> = { serviceLine: 'MOVING', source: 'SYSTEM' };
  // 지점 소속이면 그 지점, 관리자처럼 지점 스코프가 없으면 연결된 직원의 조직(시스템관리자)
  const defaultOrg = ownOrgId || user?.employeeOrgUnitId || '';
  if (defaultOrg) defaults.orgUnitId = defaultOrg;
  if (user?.employeeId) defaults.ownerEmpId = user.employeeId;

  return { fields, defaults, partners };
}
