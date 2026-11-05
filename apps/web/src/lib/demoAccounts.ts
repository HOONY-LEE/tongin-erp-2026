/** 로그인 화면(웹·데스크톱)이 같이 쓰는 데모 계정 목록과 '아이디 기억하기' */
import { useEffect, useState } from 'react';
import type { HealthResponse } from '@tongin/shared';
import { api } from './api';

/**
 * 데모 계정 목록을 보여 줄지 — 서버가 시연 모드(/api/health demo:true)일 때만.
 * 실고객을 받는 서버(DEMO_SEED=off)에서는 계정 이름·비밀번호를 로그인 화면에 띄우지 않는다.
 * 서버 답을 받기 전·못 받으면 감춘다.
 */
export function useDemoLogin(): boolean {
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    let alive = true;
    api<HealthResponse>('/health')
      .then((h) => alive && setDemo(h.demo === true))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return demo;
}

// apps/api/prisma/seed-demo.ts가 만드는 실제 계정 중 몇 개(시연용 바로 로그인).
// 비밀번호는 시드의 DEMO_PASSWORD 기본값('tongin1234!' — 모든 계정 공통). env로 바꿔 시드했다면 이 목록도 맞춰야 한다.
const DEMO_PASSWORD = 'tongin1234!';
export interface DemoAccount {
  group: string;
  loginId: string;
  password: string;
  name: string;
  desc: string;
}
export const DEMO_ACCOUNTS: DemoAccount[] = [
  // 본사 — 실제 조직도(prisma/seed-demo.ts CHART) 순서대로 전원. 묶음 = 부서
  {
    group: '대표',
    loginId: 'kookjong_ko',
    password: DEMO_PASSWORD,
    name: '고국종',
    desc: '대표이사 · 전체 권한',
  },
  {
    group: '그룹 기획 관리실',
    loginId: 'kideok_bae',
    password: DEMO_PASSWORD,
    name: '배기덕',
    desc: '실장',
  },
  {
    group: '경영관리',
    loginId: 'wansung_kim',
    password: DEMO_PASSWORD,
    name: '김완성',
    desc: '본부장 · 정산·인사·총무',
  },
  {
    group: '경영관리',
    loginId: 'eunsook_kang',
    password: DEMO_PASSWORD,
    name: '강은숙',
    desc: '차장',
  },
  {
    group: '경영관리',
    loginId: 'sangeun_lee',
    password: DEMO_PASSWORD,
    name: '이상은',
    desc: '대리 · 정산·인사·계약/자산',
  },
  {
    group: '가맹',
    loginId: 'chulmin_jung',
    password: DEMO_PASSWORD,
    name: '정철민',
    desc: '본부장 · 가맹 관리',
  },
  {
    group: '가맹',
    loginId: 'joonyoung_kim',
    password: DEMO_PASSWORD,
    name: '김준영',
    desc: '부장 · 지점 점검·보험·소송·재계약',
  },
  {
    group: '가맹',
    loginId: 'sungsoo_kwak',
    password: DEMO_PASSWORD,
    name: '곽성수',
    desc: '과장',
  },
  {
    group: '가맹',
    loginId: 'bongjoon_choi',
    password: DEMO_PASSWORD,
    name: '최봉준',
    desc: '대리',
  },
  {
    group: '기업영업',
    loginId: 'kyungchul_lee',
    password: DEMO_PASSWORD,
    name: '이경철',
    desc: '부장 · 기업 이전 영업·견적',
  },
  {
    group: '홈플래너',
    loginId: 'misun_joo',
    password: DEMO_PASSWORD,
    name: '주미선',
    desc: '부장 · 방문 견적·상담·계약',
  },
  {
    group: '홈플래너',
    loginId: 'yoonmoo_heo',
    password: DEMO_PASSWORD,
    name: '허윤무',
    desc: '실장',
  },
  {
    group: '홈플래너',
    loginId: 'donghee_choi',
    password: DEMO_PASSWORD,
    name: '최동희',
    desc: '실장',
  },
  {
    group: '홈플래너',
    loginId: 'sooji_ahn',
    password: DEMO_PASSWORD,
    name: '안수지',
    desc: '사원',
  },
  {
    group: '홈플래너',
    loginId: 'kiyoung_kwon',
    password: DEMO_PASSWORD,
    name: '권기영',
    desc: '사원',
  },
  {
    group: '고객관리부',
    loginId: 'miyoung_kim',
    password: DEMO_PASSWORD,
    name: '김미영',
    desc: '과장 · 문자·해피콜·상품/경로',
  },
  {
    group: '고객관리부',
    loginId: 'eunjoo_noh',
    password: DEMO_PASSWORD,
    name: '노은주',
    desc: '과장',
  },
  {
    group: '고객관리부',
    loginId: 'eunhye_kim',
    password: DEMO_PASSWORD,
    name: '김은혜',
    desc: '대리',
  },
  {
    group: '고객관리부',
    loginId: 'kisook_lim',
    password: DEMO_PASSWORD,
    name: '임기숙',
    desc: '사원 · 접수 상담',
  },
  {
    group: '고객관리부',
    loginId: 'myungwon_lee',
    password: DEMO_PASSWORD,
    name: '이명원',
    desc: '사원',
  },
  {
    group: '고객관리부',
    loginId: 'misun_kim',
    password: DEMO_PASSWORD,
    name: '김미선',
    desc: '팀장 · 접수 상담·A/S·리빙케어',
  },
  {
    group: '디자인',
    loginId: 'jisook_jeon',
    password: DEMO_PASSWORD,
    name: '전지숙',
    desc: '실장 · 디자인 요청',
  },
  {
    group: '디자인',
    loginId: 'chaeeun_wang',
    password: DEMO_PASSWORD,
    name: '왕채은',
    desc: '사원',
  },
  {
    group: '디자인',
    loginId: 'jooyeon_jung',
    password: DEMO_PASSWORD,
    name: '정주연',
    desc: '사원',
  },
  {
    group: '마케팅',
    loginId: 'seungho_song',
    password: DEMO_PASSWORD,
    name: '송승호',
    desc: '팀장 · 캠페인·홍보',
  },
  {
    group: '마케팅',
    loginId: 'soobin_kim',
    password: DEMO_PASSWORD,
    name: '김수빈',
    desc: '사원',
  },
  {
    group: '무브제',
    loginId: 'kyuyeol_pi',
    password: DEMO_PASSWORD,
    name: '피규열',
    desc: '팀장 · 사업 추진',
  },
  {
    group: '무브제',
    loginId: 'taewon_kim',
    password: DEMO_PASSWORD,
    name: '김태원',
    desc: '과장',
  },
  {
    group: '전속제휴',
    loginId: 'taehwan_oh',
    password: DEMO_PASSWORD,
    name: '오태환',
    desc: '과장 · 제휴',
  },
  {
    group: '부동산사업부',
    loginId: 'minkeun_shin',
    password: DEMO_PASSWORD,
    name: '신민근',
    desc: '소장',
  },
  ...(import.meta.env.DEV
    ? [{ group: '개발용', loginId: 'admin', password: 'admin1234', name: 'admin', desc: '개발용' }]
    : []),
  // 지점장 — 기존 전산 계정 목록(prisma/data/legacy-accounts.ts)
  {
    group: '지점장',
    loginId: 'dongseok_shin',
    password: DEMO_PASSWORD,
    name: '신동석',
    desc: '송파점',
  },
  {
    group: '지점장',
    loginId: 'inseok_choi',
    password: DEMO_PASSWORD,
    name: '최인석',
    desc: 'VIP점',
  },
  {
    group: '지점장',
    loginId: 'keunsung_choi',
    password: DEMO_PASSWORD,
    name: '최근성',
    desc: '강남1호점',
  },
  {
    group: '지점장',
    loginId: 'dongchul_kim',
    password: DEMO_PASSWORD,
    name: '김동철',
    desc: '해운대점',
  },
  {
    group: '지점장',
    loginId: 'bongki_yoo',
    password: DEMO_PASSWORD,
    name: '유봉기',
    desc: '분당구미',
  },
];
export const DEMO_GROUPS = [...new Set(DEMO_ACCOUNTS.map((a) => a.group))];

export const REMEMBER_KEY = 'tongin.rememberId';

/** 기억해 둔 아이디(비밀번호는 저장하지 않는다) */
export function readRemembered(): string | null {
  try {
    return localStorage.getItem(REMEMBER_KEY);
  } catch {
    return null;
  }
}
