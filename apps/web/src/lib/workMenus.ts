import { useMemo } from 'react';
import { useDirectory } from './approvals';
import type { BadgeColor } from '../components/ui';

/** 공통 업무 메뉴(공지·팀 업무·계약/자산·지점 관리 기록)가 같이 쓰는 도우미 */

export interface PersonRef {
  id: string;
  name: string;
  orgUnit?: { name: string } | null;
}
export interface OrgRef {
  id: string;
  name: string;
}

/** 'YYYY-MM-DD' (DATE 컬럼은 UTC 자정으로 오므로 앞 10자리) */
export const ymd = (v: unknown) => (v ? String(v).slice(0, 10) : '');
/** 작성 시각 — 2026. 10. 29. */
export const shortDate = (v: unknown) =>
  v ? new Date(String(v)).toLocaleDateString('ko-KR', { dateStyle: 'medium' }) : '';
export const won = (v: unknown) =>
  v === null || v === undefined || v === '' ? '' : `${Number(v).toLocaleString('ko-KR')}원`;

/** 오늘(한국 날짜)부터 그 날까지 남은 일수. 지났으면 음수 */
export function daysLeft(date: unknown): number | null {
  if (!date) return null;
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${ymd(date)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** D-day 글자와 색 — 지남: 빨강, 30일 이내: 주황, 그 밖: 회색 */
export function ddayInfo(
  date: unknown,
  warnDays = 30,
): { label: string; color: BadgeColor; level: 'over' | 'soon' | 'ok' } | null {
  const d = daysLeft(date);
  if (d === null) return null;
  if (d < 0) return { label: `${-d}일 지남`, color: 'error', level: 'over' };
  if (d === 0) return { label: 'D-day', color: 'warning', level: 'soon' };
  return d <= warnDays
    ? { label: `D-${d}`, color: 'warning', level: 'soon' }
    : { label: `D-${d}`, color: 'neutral', level: 'ok' };
}

/** 사람·조직 고르기 — 결재 명부(로그인만으로 읽힘)를 그대로 쓴다. 지점 직원은 빼고 본사 사람만 팀별로 묶는다 */
export function useWorkDirectory() {
  const { people, orgs } = useDirectory();
  return useMemo(() => {
    const orgById = new Map(orgs.map((o) => [o.id, o]));
    const hqOrgs = orgs.filter((o) => o.type !== 'BRANCH');
    const groups = hqOrgs
      .map((o) => ({
        label: o.name,
        options: people
          .filter((p) => p.orgUnitId === o.id)
          .map((p) => ({
            value: p.id,
            label: [p.name, p.positionName].filter(Boolean).join(' '),
          })),
      }))
      .filter((g) => g.options.length > 0);
    return {
      /** 직원 선택지 — 본사 팀별 묶음 */
      peopleGroups: groups,
      /** 팀 선택지 — 본사 부서·TF */
      teamOptions: orgs
        .filter((o) => o.type === 'DEPT' || o.type === 'TF')
        .map((o) => ({ value: o.id, label: o.name })),
      /** 공지 대상 — 지점을 뺀 조직(그룹·회사·부서). 회사에 걸면 그 아래 지점까지 본다 */
      audienceOrgs: hqOrgs,
      branchOptions: orgs
        .filter((o) => o.type === 'BRANCH')
        .map((o) => ({ value: o.id, label: o.name }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ko')),
      orgById,
    };
  }, [people, orgs]);
}

/** 상세 수정 폼 초기값 — null·숫자를 FormModal이 받는 문자열로 */
export function toInitial(obj: Record<string, unknown>, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = obj[k];
    if (v === null || v === undefined || v === '') continue;
    out[k] = /Date$|At$/.test(k) ? ymd(v) : String(v);
  }
  return out;
}
