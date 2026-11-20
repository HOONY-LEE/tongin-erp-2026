/** 직원 칩·프로필 카드용 요약(이름·직책·소속·연락처·사진·재직 상태) — 목록 응답에 같은 모양으로 붙인다 */
export const EMPLOYEE_BRIEF_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  photoAt: true,
  isActive: true,
  resignDate: true,
  position: { select: { name: true } },
  orgUnit: { select: { name: true } },
} as const;
