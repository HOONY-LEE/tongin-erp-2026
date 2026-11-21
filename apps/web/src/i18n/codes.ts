import * as S from '@tongin/shared';
import i18n, { codeLabel, tDyn } from './index';

/**
 * 서버 이름표(@tongin/shared의 *_LABEL)를 지금 언어로 — 같은 이름·같은 모양의 표.
 * 값을 읽을 때마다 번역(code.<그룹>.<값>)을 찾고, 없으면 한국어 그대로.
 * 화면에서는 '@tongin/shared' 대신 여기서 *_LABEL을 가져온다(서버·저장값은 한국어 원본 그대로).
 */
type Labels<T> = { readonly [K in keyof T]: string };

const registry: [string, Record<string, string>][] = [];

function translated<T extends Record<string, string>>(group: string, ko: T): Labels<T> {
  registry.push([group, ko]);
  const out = {} as Record<string, string>;
  for (const k of Object.keys(ko))
    Object.defineProperty(out, k, { enumerable: true, get: () => codeLabel(group, k, ko) });
  return out as Labels<T>;
}

export const ORG_UNIT_TYPE_LABEL = translated('orgUnitType', S.ORG_UNIT_TYPE_LABEL);
export const SERVICE_LINE_LABEL = translated('serviceLine', S.SERVICE_LINE_LABEL);
export const PRICING_METHOD_LABEL = translated('pricingMethod', S.PRICING_METHOD_LABEL);
export const PARTNER_TYPE_LABEL = translated('partnerType', S.PARTNER_TYPE_LABEL);
export const PARTNER_CONTRACT_STATUS_LABEL = translated(
  'partnerContractStatus',
  S.PARTNER_CONTRACT_STATUS_LABEL,
);
export const MOVE_KIND_LABEL = translated('moveKind', S.MOVE_KIND_LABEL);
export const LEAD_STATUS_LABEL = translated('leadStatus', S.LEAD_STATUS_LABEL);
export const HANDLING_LABEL = translated('handling', S.HANDLING_LABEL);
export const HANDLING_BUCKET_LABEL = translated('handlingBucket', S.HANDLING_BUCKET_LABEL);
export const VOLUME_UNIT_LABEL = translated('volumeUnit', S.VOLUME_UNIT_LABEL);
export const BUNDLE_ROLE_LABEL = translated('bundleRole', S.BUNDLE_ROLE_LABEL);
export const ESTIMATE_OPTION_GROUP_LABEL = translated(
  'estimateOptionGroup',
  S.ESTIMATE_OPTION_GROUP_LABEL,
);
export const ACCESS_LABEL = translated('access', S.ACCESS_LABEL);
export const WORK_PHOTO_KIND_LABEL = translated('workPhotoKind', S.WORK_PHOTO_KIND_LABEL);
export const CAMPAIGN_CHANNEL_LABEL = translated('campaignChannel', S.CAMPAIGN_CHANNEL_LABEL);
export const CAMPAIGN_STATUS_LABEL = translated('campaignStatus', S.CAMPAIGN_STATUS_LABEL);
export const ANOMALY_LEVEL_LABEL = translated('anomalyLevel', S.ANOMALY_LEVEL_LABEL);
export const STATS_METRIC_LABEL = translated('statsMetric', S.STATS_METRIC_LABEL);
export const CRUD_ACTION_LABEL = translated('crudAction', S.CRUD_ACTION_LABEL);
export const TASK_STATUS_LABEL = translated('taskStatus', S.TASK_STATUS_LABEL);
export const ASSET_KIND_LABEL = translated('assetKind', S.ASSET_KIND_LABEL);
export const ASSET_AMOUNT_UNIT_LABEL = translated('assetAmountUnit', S.ASSET_AMOUNT_UNIT_LABEL);
export const BRANCH_CASE_KIND_LABEL = translated('branchCaseKind', S.BRANCH_CASE_KIND_LABEL);
export const BRANCH_CASE_STATUS_LABEL = translated('branchCaseStatus', S.BRANCH_CASE_STATUS_LABEL);
export const AGENT_NODE_LABEL = translated('agentNode', S.AGENT_NODE_LABEL);
export const AGENT_BLUEPRINT_STATUS_LABEL = translated(
  'agentBlueprintStatus',
  S.AGENT_BLUEPRINT_STATUS_LABEL,
);
export const AGENT_RUN_STATUS_LABEL = translated('agentRunStatus', S.AGENT_RUN_STATUS_LABEL);
export const AGENT_VISIBILITY_LABEL = translated('agentVisibility', S.AGENT_VISIBILITY_LABEL);
export const TRIGGER_KIND_LABEL = translated('triggerKind', S.TRIGGER_KIND_LABEL);
export const TRIGGER_EVENT_LABEL = translated('triggerEvent', S.TRIGGER_EVENT_LABEL);
export const GUARDRAIL_LABEL = translated('guardrail', S.GUARDRAIL_LABEL);
export const DASH_VIZ_LABEL = translated('dashViz', S.DASH_VIZ_LABEL);
export const DASH_PERIOD_LABEL = translated('dashPeriod', S.DASH_PERIOD_LABEL);
export const DASH_METRIC_LABEL = translated('dashMetric', S.DASH_METRIC_LABEL);
export const APPROVAL_DOC_TYPE_LABEL = translated('approvalDocType', S.APPROVAL_DOC_TYPE_LABEL);
export const FORM_FIELD_TYPE_LABEL = translated('formFieldType', S.FORM_FIELD_TYPE_LABEL);
export const SUBSTITUTE_MODE_LABEL = translated('substituteMode', S.SUBSTITUTE_MODE_LABEL);
export const LEAVE_SLOT_LABEL = translated('leaveSlot', S.LEAVE_SLOT_LABEL);
export const APPROVAL_STATUS_LABEL = translated('approvalStatus', S.APPROVAL_STATUS_LABEL);
export const APPROVAL_STEP_STATUS_LABEL = translated(
  'approvalStepStatus',
  S.APPROVAL_STEP_STATUS_LABEL,
);
export const APPROVAL_RESOLVER_LABEL = translated('approvalResolver', S.APPROVAL_RESOLVER_LABEL);
export const LEAVE_STATUS_LABEL = translated('leaveStatus', S.LEAVE_STATUS_LABEL);
export const ATTENDANCE_STATUS_LABEL = translated('attendanceStatus', S.ATTENDANCE_STATUS_LABEL);
export const EMPLOYMENT_TYPE_LABEL = translated('employmentType', S.EMPLOYMENT_TYPE_LABEL);
export const CHECKLIST_KIND_LABEL = translated('checklistKind', S.CHECKLIST_KIND_LABEL);
export const EMPLOYEE_HISTORY_LABEL = translated('employeeHistory', S.EMPLOYEE_HISTORY_LABEL);
export const DUTY_CYCLE_LABEL = translated('dutyCycle', S.DUTY_CYCLE_LABEL);
export const FRANCHISE_STATUS_LABEL = translated('franchiseStatus', S.FRANCHISE_STATUS_LABEL);
export const CRM_INTEREST_LABEL = translated('crmInterest', S.CRM_INTEREST_LABEL);
export const CRM_ACTIVITY_LABEL = translated('crmActivity', S.CRM_ACTIVITY_LABEL);
export const LEAD_SOURCE_LABEL = translated('leadSource', S.LEAD_SOURCE_LABEL);
export const SALES_GROUP_BY_LABEL = translated('salesGroupBy', S.SALES_GROUP_BY_LABEL);
export const KNOWLEDGE_CATEGORY_LABEL = translated('knowledgeCategory', S.KNOWLEDGE_CATEGORY_LABEL);
export const KNOWLEDGE_CONCEPT_KIND_LABEL = translated(
  'knowledgeConceptKind',
  S.KNOWLEDGE_CONCEPT_KIND_LABEL,
);
export const MENU_TARGET_LABEL = translated('menuTarget', S.MENU_TARGET_LABEL);

let reverse: Map<string, string> | null = null;

/**
 * 서버가 이름표 글자(한국어)로 보낸 값 — 대시보드 차트 항목 이름·목록 상태 등 — 을 지금 언어로.
 * 모르는 글자는 그대로.
 */
export function trServerLabel(text: string): string {
  if (i18n.language === 'ko') return text;
  if (!reverse) {
    reverse = new Map();
    for (const [group, ko] of registry)
      for (const [k, v] of Object.entries(ko))
        if (!reverse.has(v)) reverse.set(v, codeLabel(group, k, ko));
  }
  const hit = reverse.get(text);
  if (hit) return hit;
  // 월 이름('12월')
  const m = /^(\d{1,2})월$/.exec(text);
  if (m)
    return new Date(2000, Number(m[1]) - 1, 1).toLocaleString(i18n.language, { month: 'short' });
  // 대시보드 표 칼럼 이름 등 서버 글자(dashw.s)
  return tDyn(`dashw.s.${text}`, text);
}

/** 응답 안의 label·status·kind 글자를 지금 언어로(깊이 따라가며 새 객체로) */
export function localizeServerLabels<T>(v: T): T {
  if (Array.isArray(v)) return v.map(localizeServerLabels) as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>))
      out[k] =
        (k === 'label' || k === 'status' || k === 'kind') && typeof x === 'string'
          ? trServerLabel(x)
          : localizeServerLabels(x);
    return out as T;
  }
  return v;
}
